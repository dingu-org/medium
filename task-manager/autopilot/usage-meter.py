#!/usr/bin/env python3
"""Rolling-window usage meter for Claude Code.

Anthropic's limits are account-wide over a rolling 5-hour window, so this scans
every project's transcripts, dedupes by message id, and reports:

  - burn in the current 5-hour window (cost-equivalent USD at API list prices)
  - the historical maximum 5-hour-window burn ever recorded on this machine,
    which is an empirical lower bound on the account's actual ceiling

Usage: python3 usage_meter.py [--history] [--window-hours 5]
"""

import glob
import json
import os
import sys
from datetime import datetime, timedelta, timezone

# API list prices, USD per million tokens: (input, output)
PRICES = {
    "opus": (15.0, 75.0),
    "sonnet": (3.0, 15.0),
    "haiku": (1.0, 5.0),
    "fable": (15.0, 75.0),
}
CACHE_READ_MULT = 0.1
CACHE_WRITE_5M_MULT = 1.25
CACHE_WRITE_1H_MULT = 2.0


def price_for(model: str):
    m = (model or "").lower()
    for key, val in PRICES.items():
        if key in m:
            return val
    return PRICES["sonnet"]


def cost_of(model: str, u: dict) -> float:
    inp, out = price_for(model)
    cache = u.get("cache_creation") or {}
    write_5m = cache.get("ephemeral_5m_input_tokens", 0)
    write_1h = cache.get("ephemeral_1h_input_tokens", 0)
    if not (write_5m or write_1h):
        write_5m = u.get("cache_creation_input_tokens", 0)
    tokens_in = (
        u.get("input_tokens", 0)
        + u.get("cache_read_input_tokens", 0) * CACHE_READ_MULT
        + write_5m * CACHE_WRITE_5M_MULT
        + write_1h * CACHE_WRITE_1H_MULT
    )
    return (tokens_in * inp + u.get("output_tokens", 0) * out) / 1_000_000


def load_events():
    """Every billed assistant message on this machine: (timestamp, model, cost)."""
    seen = set()
    events = []
    root = os.path.expanduser("~/.claude/projects")
    for path in glob.glob(os.path.join(root, "**", "*.jsonl"), recursive=True):
        try:
            fh = open(path, errors="replace")
        except OSError:
            continue
        with fh:
            for line in fh:
                if '"usage"' not in line:
                    continue
                try:
                    d = json.loads(line)
                except (ValueError, TypeError):
                    continue
                if d.get("type") != "assistant":
                    continue
                msg = d.get("message") or {}
                usage = msg.get("usage")
                mid = msg.get("id")
                if not usage or not mid or mid in seen:
                    continue
                seen.add(mid)
                ts = d.get("timestamp")
                if not ts:
                    continue
                try:
                    when = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    continue
                events.append((when, msg.get("model", ""), cost_of(msg.get("model", ""), usage)))
    events.sort(key=lambda e: e[0])
    return events


def window_max(events, hours):
    """Largest total cost inside any `hours`-wide sliding window."""
    span = timedelta(hours=hours)
    best, best_end = 0.0, None
    left = 0
    running = 0.0
    for right, (when, _, cost) in enumerate(events):
        running += cost
        while events[left][0] < when - span:
            running -= events[left][2]
            left += 1
        if running > best:
            best, best_end = running, when
    return best, best_end


def main():
    hours = 5.0
    if "--window-hours" in sys.argv:
        hours = float(sys.argv[sys.argv.index("--window-hours") + 1])
    events = load_events()
    if not events:
        print("no usage records found")
        return

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)
    current = [e for e in events if e[0] >= cutoff]
    current_cost = sum(e[2] for e in current)

    by_model = {}
    for _, model, cost in current:
        by_model[model or "unknown"] = by_model.get(model or "unknown", 0.0) + cost

    print(f"=== rolling {hours:g}h window (since {cutoff:%Y-%m-%d %H:%M} UTC) ===")
    print(f"cost-equivalent burn : ${current_cost:,.2f}")
    print(f"messages             : {len(current)}")
    for model, cost in sorted(by_model.items(), key=lambda kv: -kv[1]):
        print(f"  {model:<28} ${cost:,.2f}")

    if current:
        oldest = current[0][0]
        elapsed = (now - oldest).total_seconds() / 3600 or 0.01
        print(f"burn rate            : ${current_cost / elapsed:,.2f}/h over {elapsed:.1f}h")
        print(f"window frees up at   : {(oldest + timedelta(hours=hours)).astimezone():%Y-%m-%d %H:%M %Z}")

    if "--history" in sys.argv:
        peak, peak_end = window_max(events, hours)
        print(f"\n=== historical peak {hours:g}h window (empirical ceiling lower bound) ===")
        print(f"peak burn            : ${peak:,.2f}")
        if peak_end:
            print(f"ending               : {peak_end.astimezone():%Y-%m-%d %H:%M %Z}")
        print(f"current vs peak      : {100 * current_cost / peak:.0f}%" if peak else "")


if __name__ == "__main__":
    main()
