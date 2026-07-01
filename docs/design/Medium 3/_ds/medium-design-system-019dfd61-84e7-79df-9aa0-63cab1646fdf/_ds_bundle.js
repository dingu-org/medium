/* @ds-bundle: {"format":3,"namespace":"MediumDesignSystem_019dfd","components":[],"sourceHashes":{"ui_kits/onboarding/OnboardingFields.jsx":"d2fc474d3a7e","ui_kits/onboarding/OnboardingShell.jsx":"64fda042ebc1","ui_kits/onboarding/OnboardingSteps.jsx":"362fbefa76d9","ui_kits/onboarding/PhoneFrame.jsx":"66143ca13847","ui_kits/onboarding/ios-frame.jsx":"d67eb3ffe562","ui_kits/pwa/AppointmentDetail.jsx":"2ebf47bbdc7b","ui_kits/pwa/AvailabilityScreen.jsx":"7fddf7bab24d","ui_kits/pwa/CalendarWeek.jsx":"e230af446861","ui_kits/pwa/ChatsScreen.jsx":"b3a0c89e0f15","ui_kits/pwa/Icon.jsx":"fd94e5291040","ui_kits/pwa/MobileScreens.jsx":"c9fd75df05e9","ui_kits/pwa/MobileShell.jsx":"a88b1a240afa","ui_kits/pwa/PhoneFrame.jsx":"66143ca13847","ui_kits/pwa/Sidebar.jsx":"fba6e8ec93fe","ui_kits/pwa/TodaySummary.jsx":"2e99eedea0c6","ui_kits/pwa/TopBar.jsx":"8d61f431cfeb","ui_kits/pwa/ios-frame.jsx":"d67eb3ffe562"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.MediumDesignSystem_019dfd = window.MediumDesignSystem_019dfd || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/onboarding/OnboardingFields.jsx
try { (() => {
// Single-purpose onboarding step components
const StepHeader = ({
  eyebrow,
  title,
  sub
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    marginBottom: 22
  }
}, eyebrow && /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8d95a3",
    marginBottom: 8
  }
}, eyebrow), /*#__PURE__*/React.createElement("h1", {
  style: {
    fontFamily: '"Inter Tight", sans-serif',
    fontSize: 26,
    fontWeight: 600,
    letterSpacing: "-0.025em",
    color: "#0F1420",
    margin: 0,
    lineHeight: 1.15
  }
}, title), sub && /*#__PURE__*/React.createElement("p", {
  style: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
    lineHeight: 1.5
  }
}, sub));
const Field = ({
  label,
  children,
  help,
  error
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 16
  }
}, /*#__PURE__*/React.createElement("label", {
  style: {
    fontSize: 13,
    fontWeight: 600,
    color: "#303744"
  }
}, label), children, help && /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 12,
    color: "#8d95a3"
  }
}, help), error && /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 12,
    color: "#b3322b"
  }
}, error));
const TextInput = ({
  value,
  onChange,
  placeholder,
  prefix,
  large
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    alignItems: "center",
    height: large ? 44 : 38,
    padding: "0 12px",
    border: "1px solid #d4dae3",
    borderRadius: 6,
    background: "#fff"
  }
}, prefix && /*#__PURE__*/React.createElement("span", {
  style: {
    fontSize: 14,
    color: "#8d95a3",
    marginRight: 8,
    fontFamily: '"JetBrains Mono", monospace'
  }
}, prefix), /*#__PURE__*/React.createElement("input", {
  value: value,
  onChange: e => onChange?.(e.target.value),
  placeholder: placeholder,
  style: {
    flex: 1,
    border: "none",
    outline: "none",
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    color: "#0F1420",
    background: "transparent"
  }
}));
const RadioCard = ({
  icon,
  title,
  sub,
  selected,
  onClick
}) => /*#__PURE__*/React.createElement("button", {
  onClick: onClick,
  style: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "16px 18px",
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    background: selected ? "#ecf3f9" : "#fff",
    border: `1px solid ${selected ? "#1F5D86" : "#e3e7ed"}`,
    borderRadius: 10,
    fontFamily: "Inter, sans-serif",
    boxShadow: selected ? "0 0 0 3px rgba(31, 93, 134, 0.12)" : "none",
    transition: "all 120ms"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: selected ? "#1F5D86" : "#eef0f4",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: icon,
  size: 18,
  color: selected ? "#fff" : "#4b5563"
})), /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1,
    minWidth: 0
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0F1420"
  }
}, title), /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2
  }
}, sub)), /*#__PURE__*/React.createElement("div", {
  style: {
    width: 18,
    height: 18,
    borderRadius: 999,
    border: `1.5px solid ${selected ? "#1F5D86" : "#d4dae3"}`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2
  }
}, selected && /*#__PURE__*/React.createElement("div", {
  style: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "#1F5D86"
  }
})));
const PrimaryRow = ({
  onBack,
  onNext,
  nextLabel = "Vazhdo",
  disabled
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 32,
    paddingTop: 20,
    borderTop: "1px solid #eef0f4"
  }
}, /*#__PURE__*/React.createElement("button", {
  onClick: onBack,
  style: {
    background: "transparent",
    border: "none",
    color: "#6b7280",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    display: onBack ? "inline-flex" : "none",
    alignItems: "center",
    gap: 4
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: "chevronLeft",
  size: 14,
  color: "#6b7280"
}), "Mbrapa"), /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1
  }
}), /*#__PURE__*/React.createElement("button", {
  onClick: disabled ? null : onNext,
  disabled: disabled,
  style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 40,
    padding: "0 18px",
    background: "#1F5D86",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1
  }
}, /*#__PURE__*/React.createElement("span", null, nextLabel), /*#__PURE__*/React.createElement(Icon, {
  name: "arrowRight",
  size: 14,
  color: "#fff"
})));
window.StepHeader = StepHeader;
window.Field = Field;
window.TextInput = TextInput;
window.RadioCard = RadioCard;
window.PrimaryRow = PrimaryRow;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/onboarding/OnboardingFields.jsx", error: String((e && e.message) || e) }); }

// ui_kits/onboarding/OnboardingShell.jsx
try { (() => {
// Mobile-first onboarding shell — sits inside a 390×844 iPhone frame.
// Replaces the desktop horizontal-bar progress with a slim top-of-screen
// dotted progress + brand mark, and a full-bleed body that scrolls.

const OnboardingShell = ({
  step,
  total,
  children
}) => /*#__PURE__*/React.createElement("div", {
  style: obStyles.root
}, /*#__PURE__*/React.createElement("header", {
  style: obStyles.head
}, /*#__PURE__*/React.createElement("div", {
  style: obStyles.brand
}, /*#__PURE__*/React.createElement("img", {
  src: "../../assets/logo-mark.svg",
  width: "22",
  height: "22",
  alt: ""
}), /*#__PURE__*/React.createElement("span", {
  style: obStyles.brandText
}, "Medium")), /*#__PURE__*/React.createElement("div", {
  style: obStyles.progress
}, Array.from({
  length: total
}).map((_, i) => /*#__PURE__*/React.createElement("div", {
  key: i,
  style: {
    ...obStyles.dot,
    background: i <= step ? "#1F5D86" : "#e3e7ed",
    width: i === step ? 18 : 6
  }
}))), /*#__PURE__*/React.createElement("button", {
  style: obStyles.skip
}, "Dil")), /*#__PURE__*/React.createElement("main", {
  style: obStyles.body
}, /*#__PURE__*/React.createElement("div", {
  style: obStyles.frame
}, children)));
const obStyles = {
  root: {
    width: "100%",
    height: "100%",
    background: "#f7f8fa",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily: "Inter, sans-serif"
  },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px 12px",
    borderBottom: "1px solid #eef0f4",
    background: "#fff",
    flexShrink: 0
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    minWidth: 70
  },
  brandText: {
    fontFamily: '"Inter Tight", sans-serif',
    fontWeight: 600,
    fontSize: 14,
    letterSpacing: "-0.02em",
    color: "#0F1420"
  },
  progress: {
    display: "flex",
    gap: 5,
    alignItems: "center"
  },
  dot: {
    height: 5,
    borderRadius: 999,
    transition: "all 180ms cubic-bezier(0.2, 0.7, 0.2, 1)"
  },
  skip: {
    background: "transparent",
    border: "none",
    color: "#8d95a3",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    minWidth: 40,
    textAlign: "right"
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto"
  },
  frame: {
    padding: "24px 20px 24px"
  }
};
window.OnboardingShell = OnboardingShell;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/onboarding/OnboardingShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/onboarding/OnboardingSteps.jsx
try { (() => {
// The 5 onboarding steps as standalone components
const StepWelcome = ({
  next
}) => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 28
  }
}, /*#__PURE__*/React.createElement("img", {
  src: "../../assets/logo-mark.svg",
  width: "56",
  height: "56",
  alt: ""
})), /*#__PURE__*/React.createElement(StepHeader, {
  title: "Mir\xEB se erdhe te Medium",
  sub: "Asistenti yt q\xEB pret pacient\xEBt n\xEB WhatsApp dhe i rezervon takimet pa pasur nevoj\xEB t'i p\xEBrgjigjesh \xE7do mesazhi. T\xEB mbeten kat\xEBr hapa."
}), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 8
  }
}, [{
  i: "user",
  t: "Profili yt",
  s: "Si do të të njohë pacienti"
}, {
  i: "phone",
  t: "Lidh WhatsApp",
  s: "Numri me të cilin pacientët bisedojnë"
}, {
  i: "calendar",
  t: "Disponueshmëria",
  s: "Orët kur Medium mund të ofrojë takime"
}, {
  i: "sparkle",
  t: "Mëso Medium-in",
  s: "Çfarë shërbimesh dhe si t'i përgjigjet"
}].map((s, i) => /*#__PURE__*/React.createElement("div", {
  key: i,
  style: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 4px"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: "#eef0f4",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: s.i,
  size: 14,
  color: "#4b5563"
})), /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 14,
    fontWeight: 500,
    color: "#0F1420"
  }
}, s.t), /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 12,
    color: "#8d95a3"
  }
}, s.s)), /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 12,
    color: "#8d95a3",
    fontFamily: '"JetBrains Mono", monospace'
  }
}, "~", [1, 2, 3, 3][i], " min")))), /*#__PURE__*/React.createElement(PrimaryRow, {
  onNext: next,
  nextLabel: "Fillo"
}));
const StepProfile = ({
  data,
  set,
  next,
  back
}) => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(StepHeader, {
  eyebrow: "Hapi 1 nga 4",
  title: "Pak detaje p\xEBr ty",
  sub: "Pacient\xEBt do t'i shohin k\xEBto n\xEB \xE7do bised\xEB me Medium."
}), /*#__PURE__*/React.createElement(Field, {
  label: "Emri i plot\xEB"
}, /*#__PURE__*/React.createElement(TextInput, {
  value: data.name,
  onChange: v => set("name", v),
  placeholder: "p.sh. Dr. Valbona Hoxha",
  large: true
})), /*#__PURE__*/React.createElement(Field, {
  label: "Profesioni"
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10
  }
}, /*#__PURE__*/React.createElement(RadioCard, {
  icon: "user",
  title: "Fizioterapist",
  sub: "Vler\xEBsime, seanca rehabilitimi",
  selected: data.role === "pt",
  onClick: () => set("role", "pt")
}), /*#__PURE__*/React.createElement(RadioCard, {
  icon: "users",
  title: "Tjet\xEBr",
  sub: "Estetik\xEB, dentist, kozmetolog",
  selected: data.role === "other",
  onClick: () => set("role", "other")
}))), /*#__PURE__*/React.createElement(Field, {
  label: "Klinika ose praktika",
  help: "P\xEBrdoret n\xEB mesazhet e konfirmimit."
}, /*#__PURE__*/React.createElement(TextInput, {
  value: data.clinic,
  onChange: v => set("clinic", v),
  placeholder: "Klinika Hoxha \xB7 Tiran\xEB"
})), /*#__PURE__*/React.createElement(PrimaryRow, {
  onBack: back,
  onNext: next,
  disabled: !data.name || !data.role
}));
const StepWhatsApp = ({
  data,
  set,
  next,
  back
}) => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(StepHeader, {
  eyebrow: "Hapi 2 nga 4",
  title: "Lidh numrin e WhatsApp",
  sub: "Medium do t'u p\xEBrgjigjet pacient\xEBve q\xEB shkruajn\xEB n\xEB k\xEBt\xEB num\xEBr."
}), /*#__PURE__*/React.createElement(Field, {
  label: "Numri i WhatsApp Business",
  help: "Duhet t\xEB jet\xEB llogari e regjistruar si Business \u2014 jo personale."
}, /*#__PURE__*/React.createElement(TextInput, {
  prefix: "+355",
  value: data.phone,
  onChange: v => set("phone", v),
  placeholder: "69 123 4567",
  large: true
})), /*#__PURE__*/React.createElement("div", {
  style: {
    background: "#fff",
    border: "1px solid #e3e7ed",
    borderRadius: 10,
    padding: 18,
    marginTop: 8
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "#ecf6f0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: "check",
  size: 16,
  color: "#246e47"
})), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0F1420"
  }
}, "Verifikim me kod"), /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
    lineHeight: 1.5
  }
}, "Pas verifikimit, do t\xEB t\xEB d\xEBrgojm\xEB nj\xEB kod 6-shifror n\xEB WhatsApp p\xEBr t\xEB v\xEBrtetuar pron\xEBsin\xEB.")))), /*#__PURE__*/React.createElement(PrimaryRow, {
  onBack: back,
  onNext: next,
  nextLabel: "D\xEBrgo kodin",
  disabled: !data.phone || data.phone.length < 6
}));
const StepHours = ({
  data,
  set,
  next,
  back
}) => {
  const days = [{
    k: "mon",
    n: "E hënë"
  }, {
    k: "tue",
    n: "E martë"
  }, {
    k: "wed",
    n: "E mërkurë"
  }, {
    k: "thu",
    n: "E enjte"
  }, {
    k: "fri",
    n: "E premte"
  }, {
    k: "sat",
    n: "E shtunë"
  }, {
    k: "sun",
    n: "E diel"
  }];
  const toggle = k => set("days", {
    ...data.days,
    [k]: !data.days[k]
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(StepHeader, {
    eyebrow: "Hapi 3 nga 4",
    title: "Kur ofron takime?",
    sub: "Medium do t\xEB rezervoj\xEB vet\xEBm brenda k\xEBtij orari."
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Dit\xEBt dhe or\xEBt"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      marginTop: 4
    }
  }, days.map(d => {
    const on = !!data.days[d.k];
    return /*#__PURE__*/React.createElement("div", {
      key: d.k,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 4px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => toggle(d.k),
      style: {
        width: 30,
        height: 18,
        borderRadius: 999,
        position: "relative",
        background: on ? "#1F5D86" : "#d4dae3",
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        top: 2,
        width: 14,
        height: 14,
        borderRadius: 999,
        background: "#fff",
        transform: on ? "translateX(14px)" : "translateX(2px)",
        transition: "transform 120ms"
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        fontSize: 13,
        color: on ? "#0F1420" : "#8d95a3",
        fontWeight: 500
      }
    }, d.n), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: on ? 1 : 0.4
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: hourBox
    }, "09:00"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "#b6bdc9",
        fontSize: 11
      }
    }, "\u2192"), /*#__PURE__*/React.createElement("div", {
      style: hourBox
    }, "17:00")));
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "Koh\xEBzgjatja e takimeve"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 4
    }
  }, [30, 45, 60, 90].map(m => {
    const sel = data.duration === m;
    return /*#__PURE__*/React.createElement("button", {
      key: m,
      onClick: () => set("duration", m),
      style: {
        padding: "10px 16px",
        borderRadius: 6,
        background: sel ? "#1F5D86" : "#fff",
        color: sel ? "#fff" : "#4b5563",
        border: `1px solid ${sel ? "#1F5D86" : "#d4dae3"}`,
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: sel ? 500 : 400,
        cursor: "pointer"
      }
    }, m, " min");
  }))), /*#__PURE__*/React.createElement(PrimaryRow, {
    onBack: back,
    onNext: next
  }));
};
const hourBox = {
  padding: "5px 9px",
  border: "1px solid #d4dae3",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: '"JetBrains Mono", monospace',
  textAlign: "center",
  color: "#0F1420",
  background: "#fff"
};
const StepServices = ({
  data,
  set,
  next,
  back
}) => {
  const presets = [{
    id: "first",
    t: "Vlerësim i parë",
    d: "45 min"
  }, {
    id: "follow",
    t: "Seancë vijuese",
    d: "30 min"
  }, {
    id: "manual",
    t: "Terapi manuale",
    d: "60 min"
  }];
  const toggle = id => set("services", data.services.includes(id) ? data.services.filter(x => x !== id) : [...data.services, id]);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(StepHeader, {
    eyebrow: "Hapi 4 nga 4",
    title: "\xC7far\xEB sh\xEBrbimesh ofron?",
    sub: "Medium do t'i p\xEBrdor\xEB si opsione kur pacient\xEBt k\xEBrkojn\xEB takim."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, presets.map(p => {
    const sel = data.services.includes(p.id);
    return /*#__PURE__*/React.createElement("button", {
      key: p.id,
      onClick: () => toggle(p.id),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: sel ? "#ecf3f9" : "#fff",
        border: `1px solid ${sel ? "#1F5D86" : "#e3e7ed"}`,
        borderRadius: 10,
        cursor: "pointer",
        textAlign: "left",
        boxShadow: sel ? "0 0 0 3px rgba(31, 93, 134, 0.12)" : "none"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 18,
        height: 18,
        borderRadius: 4,
        border: `1.5px solid ${sel ? "#1F5D86" : "#d4dae3"}`,
        background: sel ? "#1F5D86" : "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, sel && /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 12,
      color: "#fff",
      strokeWidth: 2.5
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        fontWeight: 500,
        color: "#0F1420"
      }
    }, p.t)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "#8d95a3",
        fontFamily: '"JetBrains Mono", monospace'
      }
    }, p.d));
  }), /*#__PURE__*/React.createElement("button", {
    style: {
      padding: "12px 16px",
      border: "1px dashed #d4dae3",
      background: "transparent",
      borderRadius: 10,
      color: "#1F5D86",
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14,
    color: "#1F5D86"
  }), "Shto sh\xEBrbim tjet\xEBr")), /*#__PURE__*/React.createElement(PrimaryRow, {
    onBack: back,
    onNext: next,
    nextLabel: "P\xEBrfundo",
    disabled: data.services.length === 0
  }));
};
const StepDone = ({
  data,
  restart
}) => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 28
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    width: 64,
    height: 64,
    borderRadius: 999,
    background: "#ecf6f0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: "check",
  size: 28,
  color: "#246e47",
  strokeWidth: 2
}))), /*#__PURE__*/React.createElement(StepHeader, {
  title: "U regjistrove.",
  sub: "Medium tashm\xEB mund t\xEB pranoj\xEB rezervime n\xEB WhatsApp. Pacienti i par\xEB q\xEB shkruan do t\xEB marr\xEB nj\xEB p\xEBrgjigje brenda sekondash."
}), /*#__PURE__*/React.createElement("div", {
  style: {
    background: "#fff",
    border: "1px solid #e3e7ed",
    borderRadius: 10,
    padding: 18,
    marginTop: 8
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8d95a3",
    marginBottom: 12
  }
}, "Pamje paraprake"), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    gap: 10
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "#1F5D86",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: '"Inter Tight", sans-serif',
    position: "relative",
    flexShrink: 0
  }
}, "M", /*#__PURE__*/React.createElement("span", {
  style: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "#7CC4A8",
    border: "1.5px solid #fff"
  }
})), /*#__PURE__*/React.createElement("div", {
  style: {
    background: "#ecf3f9",
    color: "#113a55",
    padding: "10px 12px",
    borderRadius: 12,
    borderTopLeftRadius: 4,
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: "85%"
  }
}, "Mir\xEBdita, jam Medium \u2014 asistenti i ", data.name || "Dr. Hoxhës", " n\xEB ", data.clinic || "klinikë", ". Si mund t'ju ndihmoj? Mund t\xEB rezervoj nj\xEB vler\xEBsim ose seanc\xEB vijuese."))), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    gap: 10,
    marginTop: 28
  }
}, /*#__PURE__*/React.createElement("button", {
  onClick: restart,
  style: {
    flex: 1,
    height: 40,
    background: "#fff",
    color: "#4b5563",
    border: "1px solid #d4dae3",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer"
  }
}, "Konfiguro p\xEBrs\xEBri"), /*#__PURE__*/React.createElement("button", {
  style: {
    flex: 1,
    height: 40,
    background: "#1F5D86",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  }
}, /*#__PURE__*/React.createElement("span", null, "Shko te paneli"), /*#__PURE__*/React.createElement(Icon, {
  name: "arrowRight",
  size: 14,
  color: "#fff"
}))));
window.StepWelcome = StepWelcome;
window.StepProfile = StepProfile;
window.StepWhatsApp = StepWhatsApp;
window.StepHours = StepHours;
window.StepServices = StepServices;
window.StepDone = StepDone;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/onboarding/OnboardingSteps.jsx", error: String((e && e.message) || e) }); }

// ui_kits/onboarding/PhoneFrame.jsx
try { (() => {
// Tiny iPhone frame — 390×844 logical, no liquid-glass overhead.
// Renders status bar, home indicator, and clips children to the screen rect.
const PhoneFrame = ({
  children,
  label,
  time = "9:41",
  screenBg = "#f7f8fa"
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14
  }
}, /*#__PURE__*/React.createElement("div", {
  style: pf.shell
}, /*#__PURE__*/React.createElement("div", {
  style: pf.bezel
}, /*#__PURE__*/React.createElement("div", {
  style: pf.screen
}, /*#__PURE__*/React.createElement("div", {
  style: pf.statusBar
}, /*#__PURE__*/React.createElement("div", {
  style: pf.timeText
}, time), /*#__PURE__*/React.createElement("div", {
  style: pf.notch
}), /*#__PURE__*/React.createElement("div", {
  style: pf.statusRight
}, /*#__PURE__*/React.createElement("svg", {
  width: "17",
  height: "11",
  viewBox: "0 0 17 11"
}, /*#__PURE__*/React.createElement("rect", {
  x: "0",
  y: "7",
  width: "3",
  height: "4",
  rx: "0.7",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("rect", {
  x: "4.5",
  y: "5",
  width: "3",
  height: "6",
  rx: "0.7",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("rect", {
  x: "9",
  y: "2.5",
  width: "3",
  height: "8.5",
  rx: "0.7",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("rect", {
  x: "13.5",
  y: "0",
  width: "3",
  height: "11",
  rx: "0.7",
  fill: "#0F1420"
})), /*#__PURE__*/React.createElement("svg", {
  width: "15",
  height: "11",
  viewBox: "0 0 17 12"
}, /*#__PURE__*/React.createElement("path", {
  d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "8.5",
  cy: "10.5",
  r: "1.3",
  fill: "#0F1420"
})), /*#__PURE__*/React.createElement("svg", {
  width: "24",
  height: "12",
  viewBox: "0 0 27 13"
}, /*#__PURE__*/React.createElement("rect", {
  x: "0.5",
  y: "0.5",
  width: "23",
  height: "12",
  rx: "3.5",
  stroke: "#0F1420",
  strokeOpacity: "0.35",
  fill: "none"
}), /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "2",
  width: "18",
  height: "9",
  rx: "2",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("path", {
  d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
  fill: "#0F1420",
  fillOpacity: "0.4"
})))), /*#__PURE__*/React.createElement("div", {
  style: {
    ...pf.content,
    background: screenBg
  }
}, children), /*#__PURE__*/React.createElement("div", {
  style: pf.homeIndicator
}, /*#__PURE__*/React.createElement("div", {
  style: pf.homeBar
}))))), label && /*#__PURE__*/React.createElement("div", {
  style: pf.label
}, label));
const pf = {
  shell: {
    width: 390,
    height: 844,
    background: "#0F1420",
    borderRadius: 56,
    padding: 8,
    boxShadow: "0 30px 80px rgba(15, 20, 32, 0.18), 0 8px 24px rgba(15, 20, 32, 0.10), 0 1px 0 rgba(255,255,255,0.5) inset",
    flexShrink: 0
  },
  bezel: {
    width: "100%",
    height: "100%",
    background: "#000",
    borderRadius: 48,
    padding: 2
  },
  screen: {
    width: "100%",
    height: "100%",
    background: "#fff",
    borderRadius: 46,
    overflow: "hidden",
    position: "relative",
    display: "flex",
    flexDirection: "column"
  },
  statusBar: {
    height: 47,
    padding: "0 28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    position: "relative"
  },
  timeText: {
    fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
    fontWeight: 600,
    fontSize: 15,
    color: "#0F1420",
    fontVariantNumeric: "tabular-nums",
    minWidth: 60
  },
  notch: {
    position: "absolute",
    left: "50%",
    top: 11,
    transform: "translateX(-50%)",
    width: 120,
    height: 32,
    background: "#000",
    borderRadius: 999
  },
  statusRight: {
    display: "flex",
    alignItems: "center",
    gap: 5
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0
  },
  homeIndicator: {
    height: 24,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: 8,
    background: "transparent",
    flexShrink: 0
  },
  homeBar: {
    width: 134,
    height: 5,
    background: "#0F1420",
    borderRadius: 999
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8d95a3",
    fontFamily: "Inter, sans-serif"
  }
};
window.PhoneFrame = PhoneFrame;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/onboarding/PhoneFrame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/onboarding/ios-frame.jsx
try { (() => {
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports: IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/onboarding/ios-frame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/AppointmentDetail.jsx
try { (() => {
// AppointmentDetail — right rail showing one appointment + chat history
const StatusPill = ({
  status
}) => {
  const map = {
    confirmed: {
      label: "Konfirmuar",
      bg: "#ecf6f0",
      fg: "#246e47",
      dot: "#2f8b5a"
    },
    pending: {
      label: "Në pritje",
      bg: "#fcf4e6",
      fg: "#8c5c06",
      dot: "#b97a08"
    },
    noresp: {
      label: "Pa përgjigje",
      bg: "#eef0f4",
      fg: "#4b5563",
      dot: "#8d95a3"
    },
    cancelled: {
      label: "Anuluar",
      bg: "#fbecec",
      fg: "#8a2622",
      dot: "#b3322b"
    }
  };
  const s = map[status] || map.pending;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px 4px 8px",
      borderRadius: 999,
      background: s.bg,
      color: s.fg,
      fontSize: 12,
      fontWeight: 500
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 999,
      background: s.dot
    }
  }), s.label);
};
const AppointmentDetail = ({
  appt,
  onClose,
  onMessage,
  onAi
}) => {
  if (!appt) return /*#__PURE__*/React.createElement("aside", {
    style: adStyles.root
  }, /*#__PURE__*/React.createElement("div", {
    style: adStyles.empty
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar",
    size: 28,
    color: "#b6bdc9"
  }), /*#__PURE__*/React.createElement("div", {
    style: adStyles.emptyText
  }, "Zgjidh nj\xEB takim p\xEBr t\xEB par\xEB detajet")));
  return /*#__PURE__*/React.createElement("aside", {
    style: adStyles.root
  }, /*#__PURE__*/React.createElement("div", {
    style: adStyles.headRow
  }, /*#__PURE__*/React.createElement("div", {
    style: adStyles.eyebrow
  }, "Detajet e takimit"), /*#__PURE__*/React.createElement("button", {
    style: adStyles.iconBtn,
    onClick: onClose
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16,
    color: "#6b7280"
  }))), /*#__PURE__*/React.createElement("div", {
    style: adStyles.patient
  }, /*#__PURE__*/React.createElement("div", {
    style: adStyles.avatar
  }, appt.initials), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: adStyles.name
  }, appt.name), /*#__PURE__*/React.createElement("div", {
    style: adStyles.contact
  }, appt.phone)), /*#__PURE__*/React.createElement(StatusPill, {
    status: appt.status
  })), /*#__PURE__*/React.createElement("div", {
    style: adStyles.meta
  }, /*#__PURE__*/React.createElement("div", {
    style: adStyles.metaRow
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 16,
    color: "#8d95a3"
  }), /*#__PURE__*/React.createElement("span", {
    style: adStyles.metaLabel
  }, appt.dateLabel), /*#__PURE__*/React.createElement("span", {
    style: adStyles.metaValue
  }, "\xB7 ", String(appt.startH).padStart(2, "0"), ":", String(appt.startM).padStart(2, "0"), " (", appt.duration, " min)")), /*#__PURE__*/React.createElement("div", {
    style: adStyles.metaRow
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user",
    size: 16,
    color: "#8d95a3"
  }), /*#__PURE__*/React.createElement("span", {
    style: adStyles.metaLabel
  }, "Sh\xEBrbimi"), /*#__PURE__*/React.createElement("span", {
    style: adStyles.metaValue
  }, "\xB7 ", appt.service)), /*#__PURE__*/React.createElement("div", {
    style: adStyles.metaRow
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bell",
    size: 16,
    color: "#8d95a3"
  }), /*#__PURE__*/React.createElement("span", {
    style: adStyles.metaLabel
  }, "Kujtesa"), /*#__PURE__*/React.createElement("span", {
    style: adStyles.metaValue
  }, "\xB7 ", appt.reminder))), /*#__PURE__*/React.createElement("div", {
    style: adStyles.section
  }, /*#__PURE__*/React.createElement("div", {
    style: adStyles.sectionHead
  }, /*#__PURE__*/React.createElement("div", {
    style: adStyles.sectionTitle
  }, "Biseda me Medium"), /*#__PURE__*/React.createElement("div", {
    style: adStyles.aiBadge
  }, /*#__PURE__*/React.createElement("span", {
    style: adStyles.aiDot
  }), /*#__PURE__*/React.createElement("span", null, appt.convoState === "human" ? "Ti po bisedon" : "Medium · automatik"))), /*#__PURE__*/React.createElement("div", {
    style: adStyles.thread
  }, appt.thread.map((m, i) => {
    if (m.from === "system") return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: adStyles.systemNote
    }, m.text);
    const isMe = m.from === "pt";
    const isAi = m.from === "ai";
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "flex",
        justifyContent: isMe ? "flex-end" : "flex-start"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "82%"
      }
    }, isAi && /*#__PURE__*/React.createElement("div", {
      style: adStyles.aiTag
    }, /*#__PURE__*/React.createElement("span", {
      style: adStyles.aiDot
    }), "MEDIUM"), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "8px 11px",
        borderRadius: 12,
        fontSize: 13,
        lineHeight: 1.45,
        background: isMe ? "#1F5D86" : isAi ? "#ecf3f9" : "#fff",
        color: isMe ? "#fff" : isAi ? "#113a55" : "#0F1420",
        border: isMe ? "none" : isAi ? "none" : "1px solid #e3e7ed",
        borderTopRightRadius: isMe ? 4 : 12,
        borderTopLeftRadius: isMe ? 12 : 4
      }
    }, m.text), /*#__PURE__*/React.createElement("div", {
      style: {
        ...adStyles.bubbleMeta,
        textAlign: isMe ? "right" : "left"
      }
    }, m.time)));
  })), /*#__PURE__*/React.createElement("div", {
    style: adStyles.composer
  }, /*#__PURE__*/React.createElement("input", {
    placeholder: "Shkruaj nj\xEB mesazh\u2026",
    style: adStyles.composerInput
  }), /*#__PURE__*/React.createElement("button", {
    style: adStyles.sendBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "send",
    size: 16,
    color: "#fff"
  }))), /*#__PURE__*/React.createElement("div", {
    style: adStyles.actions
  }, appt.convoState === "human" ? /*#__PURE__*/React.createElement("button", {
    style: adStyles.actionGhost,
    onClick: onAi
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "handoff",
    size: 14,
    color: "#1F5D86"
  }), /*#__PURE__*/React.createElement("span", null, "Ktheja Medium-it")) : /*#__PURE__*/React.createElement("button", {
    style: adStyles.actionGhost,
    onClick: onMessage
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "message",
    size: 14,
    color: "#1F5D86"
  }), /*#__PURE__*/React.createElement("span", null, "Bisedo manualisht")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    style: adStyles.actionGhost
  }, "Ricakto"), /*#__PURE__*/React.createElement("button", {
    style: adStyles.actionDanger
  }, "Anulo takimin"))));
};
const adStyles = {
  root: {
    width: 380,
    flexShrink: 0,
    height: "100%",
    background: "#fff",
    borderLeft: "1px solid #e3e7ed",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32
  },
  emptyText: {
    fontSize: 13,
    color: "#8d95a3",
    textAlign: "center"
  },
  headRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px 0"
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8d95a3"
  },
  iconBtn: {
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },
  patient: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 20px 16px",
    borderBottom: "1px solid #eef0f4"
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    background: "#ecf3f9",
    color: "#113a55",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: '"Inter Tight", sans-serif',
    fontWeight: 600,
    fontSize: 14
  },
  name: {
    fontSize: 15,
    fontWeight: 600,
    color: "#0F1420"
  },
  contact: {
    fontSize: 12,
    color: "#8d95a3",
    fontFamily: '"JetBrains Mono", monospace',
    marginTop: 2
  },
  meta: {
    padding: "14px 20px",
    borderBottom: "1px solid #eef0f4",
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#0F1420"
  },
  metaLabel: {
    color: "#4b5563"
  },
  metaValue: {
    color: "#0F1420"
  },
  section: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0
  },
  sectionHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px 8px"
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#0F1420"
  },
  aiBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderRadius: 999,
    background: "#ecf3f9",
    color: "#113a55",
    fontSize: 11,
    fontFamily: '"JetBrains Mono", monospace'
  },
  aiDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: "#7CC4A8"
  },
  aiTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    fontFamily: '"JetBrains Mono", monospace',
    color: "#1F5D86",
    marginBottom: 3
  },
  thread: {
    padding: "0 20px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: 1,
    overflowY: "auto",
    minHeight: 0
  },
  systemNote: {
    textAlign: "center",
    fontSize: 11,
    color: "#8d95a3",
    fontFamily: '"JetBrains Mono", monospace',
    padding: "4px 0"
  },
  bubbleMeta: {
    fontSize: 10,
    color: "#8d95a3",
    padding: "3px 4px 0"
  },
  composer: {
    display: "flex",
    gap: 8,
    padding: "10px 20px",
    borderTop: "1px solid #eef0f4"
  },
  composerInput: {
    flex: 1,
    height: 36,
    padding: "0 12px",
    border: "1px solid #d4dae3",
    borderRadius: 6,
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    outline: "none"
  },
  sendBtn: {
    width: 36,
    height: 36,
    background: "#1F5D86",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer"
  },
  actions: {
    display: "flex",
    gap: 8,
    padding: "10px 20px 16px",
    alignItems: "center"
  },
  actionGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 30,
    padding: "0 10px",
    background: "transparent",
    color: "#1F5D86",
    border: "none",
    borderRadius: 6,
    fontFamily: "Inter, sans-serif",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer"
  },
  actionDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 30,
    padding: "0 12px",
    background: "#fff",
    color: "#b3322b",
    border: "1px solid #d4dae3",
    borderRadius: 6,
    fontFamily: "Inter, sans-serif",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer"
  }
};
window.AppointmentDetail = AppointmentDetail;
window.StatusPill = StatusPill;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/AppointmentDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/AvailabilityScreen.jsx
try { (() => {
// AvailabilityScreen — replaces the calendar when sidebar=avail
const AvailabilityScreen = () => {
  const days = [{
    name: "E hënë",
    start: "09:00",
    end: "17:00",
    on: true
  }, {
    name: "E martë",
    start: "09:00",
    end: "17:00",
    on: true
  }, {
    name: "E mërkurë",
    start: "09:00",
    end: "17:00",
    on: true
  }, {
    name: "E enjte",
    start: "09:00",
    end: "13:00",
    on: true
  }, {
    name: "E premte",
    start: "09:00",
    end: "17:00",
    on: true
  }, {
    name: "E shtunë",
    start: "—",
    end: "—",
    on: false
  }, {
    name: "E diel",
    start: "—",
    end: "—",
    on: false
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: avStyles.root
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.col
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.section
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.sectionHead
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.sectionTitle
  }, "Orari javor"), /*#__PURE__*/React.createElement("div", {
    style: avStyles.sectionHelp
  }, "Medium do t\xEB ofroj\xEB vet\xEBm k\xEBto orare p\xEBr pacient\xEBt.")), /*#__PURE__*/React.createElement("div", {
    style: avStyles.dayList
  }, days.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: avStyles.dayRow
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...avStyles.toggle,
      background: d.on ? "#1F5D86" : "#d4dae3"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...avStyles.toggleKnob,
      transform: d.on ? "translateX(16px)" : "translateX(2px)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      ...avStyles.dayName,
      color: d.on ? "#0F1420" : "#8d95a3"
    }
  }, d.name), /*#__PURE__*/React.createElement("div", {
    style: avStyles.timeBox
  }, d.start), /*#__PURE__*/React.createElement("div", {
    style: avStyles.dash
  }, "\u2192"), /*#__PURE__*/React.createElement("div", {
    style: avStyles.timeBox
  }, d.end))))), /*#__PURE__*/React.createElement("div", {
    style: avStyles.section
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.sectionHead
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.sectionTitle
  }, "Koh\xEBzgjatja e takimeve")), /*#__PURE__*/React.createElement("div", {
    style: avStyles.chips
  }, [30, 45, 60, 90].map(m => /*#__PURE__*/React.createElement("button", {
    key: m,
    style: {
      ...avStyles.chip,
      ...(m === 45 ? avStyles.chipActive : {})
    }
  }, m, " min"))), /*#__PURE__*/React.createElement("div", {
    style: avStyles.helpRow
  }, "Pushim mes takimeve \xB7 ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#0F1420"
    }
  }, "15 min")))), /*#__PURE__*/React.createElement("div", {
    style: avStyles.col
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.section
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.sectionHead
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.sectionTitle
  }, "Datat e bllokuara"), /*#__PURE__*/React.createElement("button", {
    style: avStyles.linkBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 13,
    color: "#1F5D86"
  }), "Shto")), /*#__PURE__*/React.createElement("div", {
    style: avStyles.blockList
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.blockRow
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: avStyles.blockTitle
  }, "Pushime"), /*#__PURE__*/React.createElement("div", {
    style: avStyles.blockMeta
  }, "10\u201317 gusht 2026 \xB7 gjith\xEB dit\xEBn")), /*#__PURE__*/React.createElement("button", {
    style: avStyles.iconBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 14,
    color: "#8d95a3"
  }))), /*#__PURE__*/React.createElement("div", {
    style: avStyles.blockRow
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: avStyles.blockTitle
  }, "Konferenc\xEB"), /*#__PURE__*/React.createElement("div", {
    style: avStyles.blockMeta
  }, "3 qer. 2026 \xB7 14:00 \u2192 18:00")), /*#__PURE__*/React.createElement("button", {
    style: avStyles.iconBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 14,
    color: "#8d95a3"
  }))))), /*#__PURE__*/React.createElement("div", {
    style: avStyles.section
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.sectionHead
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.sectionTitle
  }, "Kujtesa automatike"), /*#__PURE__*/React.createElement("div", {
    style: avStyles.sectionHelp
  }, "D\xEBrgohet 24 or\xEB para \xE7do takimi.")), /*#__PURE__*/React.createElement("div", {
    style: avStyles.previewBox
  }, /*#__PURE__*/React.createElement("div", {
    style: avStyles.previewMeta
  }, "WhatsApp template \xB7 sq"), /*#__PURE__*/React.createElement("div", {
    style: avStyles.previewBubble
  }, "Kujtes\xEB: keni nj\xEB takim me ", /*#__PURE__*/React.createElement("strong", null, "Dr. Hoxh\xEBn"), " nes\xEBr n\xEB ", /*#__PURE__*/React.createElement("strong", null, "14:30"), ". P\xEBrgjigjuni ", /*#__PURE__*/React.createElement("span", {
    style: avStyles.kw
  }, "KONFIRMO"), " p\xEBr t\xEB konfirmuar ose ", /*#__PURE__*/React.createElement("span", {
    style: avStyles.kw
  }, "ANULO"), " p\xEBr t\xEB anuluar.")))));
};
const avStyles = {
  root: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    padding: 24,
    overflowY: "auto"
  },
  col: {
    display: "flex",
    flexDirection: "column",
    gap: 16
  },
  section: {
    background: "#fff",
    border: "1px solid #e3e7ed",
    borderRadius: 10,
    padding: "18px 20px"
  },
  sectionHead: {
    marginBottom: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  sectionTitle: {
    fontFamily: '"Inter Tight", sans-serif',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    color: "#0F1420"
  },
  sectionHelp: {
    fontSize: 12,
    color: "#8d95a3",
    marginTop: 4
  },
  dayList: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  dayRow: {
    display: "grid",
    gridTemplateColumns: "32px 1fr 70px 16px 70px",
    gap: 10,
    alignItems: "center",
    padding: "6px 0"
  },
  toggle: {
    width: 30,
    height: 18,
    borderRadius: 999,
    position: "relative",
    transition: "background 120ms"
  },
  toggleKnob: {
    position: "absolute",
    top: 2,
    width: 14,
    height: 14,
    borderRadius: 999,
    background: "#fff",
    transition: "transform 120ms"
  },
  dayName: {
    fontSize: 14,
    fontWeight: 500
  },
  timeBox: {
    padding: "6px 10px",
    border: "1px solid #d4dae3",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: '"JetBrains Mono", monospace',
    textAlign: "center",
    color: "#0F1420",
    background: "#fff"
  },
  dash: {
    textAlign: "center",
    color: "#b6bdc9",
    fontSize: 12
  },
  chips: {
    display: "flex",
    gap: 8
  },
  chip: {
    padding: "8px 14px",
    borderRadius: 6,
    border: "1px solid #d4dae3",
    background: "#fff",
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    color: "#4b5563",
    cursor: "pointer"
  },
  chipActive: {
    background: "#1F5D86",
    color: "#fff",
    borderColor: "#1F5D86",
    fontWeight: 500
  },
  helpRow: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 14
  },
  linkBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "transparent",
    border: "none",
    color: "#1F5D86",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer"
  },
  blockList: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  blockRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    border: "1px solid #eef0f4",
    borderRadius: 8,
    background: "#f7f8fa"
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: "#0F1420"
  },
  blockMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2
  },
  iconBtn: {
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: 4
  },
  previewBox: {
    padding: 14,
    background: "#f7f8fa",
    border: "1px solid #eef0f4",
    borderRadius: 8
  },
  previewMeta: {
    fontSize: 11,
    fontFamily: '"JetBrains Mono", monospace',
    color: "#8d95a3",
    marginBottom: 8
  },
  previewBubble: {
    background: "#fff",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #eef0f4",
    fontSize: 13,
    lineHeight: 1.5,
    color: "#0F1420"
  },
  kw: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 12,
    padding: "1px 5px",
    background: "#eef0f4",
    borderRadius: 3,
    color: "#1F5D86"
  }
};
window.AvailabilityScreen = AvailabilityScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/AvailabilityScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/CalendarWeek.jsx
try { (() => {
// CalendarWeek — fixed-height week view with appointment tiles
const CalendarWeek = ({
  appointments,
  onPick,
  selectedId
}) => {
  const days = [{
    key: "mon",
    label: "e hënë",
    num: 4
  }, {
    key: "tue",
    label: "e martë",
    num: 5
  }, {
    key: "wed",
    label: "e mër.",
    num: 6,
    today: true
  }, {
    key: "thu",
    label: "e enjte",
    num: 7
  }, {
    key: "fri",
    label: "e premte",
    num: 8
  }, {
    key: "sat",
    label: "e shtunë",
    num: 9
  }];
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const HOUR_H = 56;
  const colorFor = status => {
    if (status === "confirmed") return {
      bg: "#ecf3f9",
      fg: "#113a55",
      bar: "#1F5D86"
    };
    if (status === "pending") return {
      bg: "#fcf4e6",
      fg: "#8c5c06",
      bar: "#b97a08"
    };
    if (status === "noresp") return {
      bg: "#eef0f4",
      fg: "#4b5563",
      bar: "#8d95a3"
    };
    if (status === "cancelled") return {
      bg: "#fbecec",
      fg: "#8a2622",
      bar: "#b3322b"
    };
    return {
      bg: "#eef0f4",
      fg: "#4b5563",
      bar: "#8d95a3"
    };
  };
  return /*#__PURE__*/React.createElement("div", {
    style: cwStyles.root
  }, /*#__PURE__*/React.createElement("div", {
    style: cwStyles.header
  }, /*#__PURE__*/React.createElement("div", {
    style: cwStyles.gutter
  }), days.map(d => /*#__PURE__*/React.createElement("div", {
    key: d.key,
    style: cwStyles.dayCell
  }, /*#__PURE__*/React.createElement("div", {
    style: cwStyles.dayLabel
  }, d.label), /*#__PURE__*/React.createElement("div", {
    style: {
      ...cwStyles.dayNum,
      ...(d.today ? cwStyles.dayNumToday : {})
    }
  }, d.num)))), /*#__PURE__*/React.createElement("div", {
    style: cwStyles.body
  }, /*#__PURE__*/React.createElement("div", {
    style: cwStyles.hours
  }, hours.map(h => /*#__PURE__*/React.createElement("div", {
    key: h,
    style: {
      ...cwStyles.hourLabel,
      height: HOUR_H
    }
  }, String(h).padStart(2, "0"), ":00"))), days.map(d => /*#__PURE__*/React.createElement("div", {
    key: d.key,
    style: cwStyles.dayCol
  }, hours.map((h, i) => /*#__PURE__*/React.createElement("div", {
    key: h,
    style: {
      ...cwStyles.gridCell,
      height: HOUR_H,
      borderTop: i === 0 ? "none" : "1px solid #eef0f4"
    }
  })), appointments.filter(a => a.day === d.key).map(a => {
    const top = (a.startH - hours[0] + a.startM / 60) * HOUR_H;
    const height = a.duration / 60 * HOUR_H - 4;
    const c = colorFor(a.status);
    const isSel = selectedId === a.id;
    return /*#__PURE__*/React.createElement("button", {
      key: a.id,
      onClick: () => onPick(a),
      style: {
        position: "absolute",
        left: 4,
        right: 4,
        top: top + 2,
        height,
        background: c.bg,
        color: c.fg,
        borderLeft: `3px solid ${c.bar}`,
        borderRadius: 6,
        padding: "6px 8px",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        lineHeight: 1.3,
        textAlign: "left",
        cursor: "pointer",
        outline: isSel ? "2px solid #1F5D86" : "none",
        outlineOffset: isSel ? 1 : 0,
        border: "none",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600
      }
    }, a.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        opacity: 0.85
      }
    }, String(a.startH).padStart(2, "0"), ":", String(a.startM).padStart(2, "0"), " \xB7 ", a.service));
  })))));
};
const cwStyles = {
  root: {
    background: "#fff",
    border: "1px solid #e3e7ed",
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0
  },
  header: {
    display: "grid",
    gridTemplateColumns: "60px repeat(6, 1fr)",
    borderBottom: "1px solid #e3e7ed",
    background: "#f7f8fa"
  },
  gutter: {
    borderRight: "1px solid #eef0f4"
  },
  dayCell: {
    padding: "12px 10px 10px",
    textAlign: "center",
    borderRight: "1px solid #eef0f4"
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#8d95a3",
    marginBottom: 4
  },
  dayNum: {
    fontFamily: '"Inter Tight", sans-serif',
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: "#303744",
    fontVariantNumeric: "tabular-nums"
  },
  dayNumToday: {
    color: "#1F5D86"
  },
  body: {
    display: "grid",
    gridTemplateColumns: "60px repeat(6, 1fr)",
    flex: 1,
    minHeight: 0,
    overflowY: "auto"
  },
  hours: {
    borderRight: "1px solid #eef0f4"
  },
  hourLabel: {
    padding: "6px 8px 0",
    fontSize: 11,
    fontFamily: '"JetBrains Mono", monospace',
    color: "#8d95a3",
    textAlign: "right"
  },
  dayCol: {
    position: "relative",
    borderRight: "1px solid #eef0f4"
  },
  gridCell: {}
};
window.CalendarWeek = CalendarWeek;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/CalendarWeek.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/ChatsScreen.jsx
try { (() => {
// ChatsScreen — list of active conversations
const ChatsScreen = () => {
  const convos = [{
    name: "Anila Hoxha",
    initials: "AH",
    channel: "wa",
    state: "ai",
    last: "Po, e enjtja në 14:30 është e përshtatshme.",
    time: "2 min",
    unread: 0
  }, {
    name: "Endi Kola",
    initials: "EK",
    channel: "wa",
    state: "human",
    last: "Do të preferoja pasdite, pas orës 16:00.",
    time: "12 min",
    unread: 2
  }, {
    name: "Genti Marku",
    initials: "GM",
    channel: "wa",
    state: "ai",
    last: "KONFIRMO",
    time: "1 orë",
    unread: 0
  }, {
    name: "Vera Lleshi",
    initials: "VL",
    channel: "wa",
    state: "ai",
    last: "Faleminderit, takimin e ricaktuat me sukses.",
    time: "3 orë",
    unread: 0
  }, {
    name: "Dritan Sopa",
    initials: "DS",
    channel: "wa",
    state: "ai",
    last: "Mund të kontrolloj orare për të premten?",
    time: "4 orë",
    unread: 1
  }, {
    name: "Mira Beqiri",
    initials: "MB",
    channel: "wa",
    state: "closed",
    last: "Takimi përfundoi.",
    time: "dje",
    unread: 0
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: chStyles.root
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.list
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.listHead
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.listFilter
  }, "T\xEB gjitha \xB7 ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#0F1420"
    }
  }, convos.length)), /*#__PURE__*/React.createElement("div", {
    style: chStyles.listFilter
  }, "Pa p\xEBrgjigje \xB7 ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "#0F1420"
    }
  }, "1")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...chStyles.listFilter,
      color: "#8d95a3"
    }
  }, "Mbyllur \xB7 24")), convos.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      ...chStyles.row,
      ...(i === 1 ? chStyles.rowActive : {})
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.avatar
  }, c.initials), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.rowTop
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.name
  }, c.name), /*#__PURE__*/React.createElement("div", {
    style: chStyles.time
  }, c.time)), /*#__PURE__*/React.createElement("div", {
    style: chStyles.rowBot
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.snippet
  }, c.last), c.state === "ai" && /*#__PURE__*/React.createElement("span", {
    style: {
      ...chStyles.tag,
      background: "#ecf3f9",
      color: "#113a55"
    }
  }, "Medium"), c.state === "human" && /*#__PURE__*/React.createElement("span", {
    style: {
      ...chStyles.tag,
      background: "#ecf6f0",
      color: "#246e47"
    }
  }, "Ti"), c.state === "closed" && /*#__PURE__*/React.createElement("span", {
    style: {
      ...chStyles.tag,
      background: "#eef0f4",
      color: "#4b5563"
    }
  }, "Mbyllur"), c.unread > 0 && /*#__PURE__*/React.createElement("span", {
    style: chStyles.unread
  }, c.unread)))))), /*#__PURE__*/React.createElement("div", {
    style: chStyles.thread
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.threadHead
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.avatar
  }, "EK"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.name
  }, "Endi Kola"), /*#__PURE__*/React.createElement("div", {
    style: chStyles.threadMeta
  }, "+355 69 234 5678 \xB7 WhatsApp")), /*#__PURE__*/React.createElement("span", {
    style: {
      ...chStyles.tag,
      background: "#ecf6f0",
      color: "#246e47"
    }
  }, "\u25CF Ti po bisedon")), /*#__PURE__*/React.createElement("div", {
    style: chStyles.threadBody
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.systemNote
  }, "4 maj \xB7 pacienti nisi bised\xEBn"), /*#__PURE__*/React.createElement("div", {
    style: chStyles.bubbleRow
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "70%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...chStyles.bubble,
      background: "#fff",
      border: "1px solid #e3e7ed",
      borderTopLeftRadius: 4
    }
  }, "Mir\xEBdita, dua t\xEB ricaktoj takimin e s\xEB enjtes."), /*#__PURE__*/React.createElement("div", {
    style: chStyles.bubMeta
  }, "14:18"))), /*#__PURE__*/React.createElement("div", {
    style: chStyles.bubbleRow
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "70%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.aiTag
  }, /*#__PURE__*/React.createElement("span", {
    style: chStyles.aiDot
  }), "MEDIUM"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...chStyles.bubble,
      background: "#ecf3f9",
      color: "#113a55",
      borderTopLeftRadius: 4
    }
  }, "Sigurisht. Cila dit\xEB ju shkon m\xEB mir\xEB \u2014 e premte ose e h\xEBn\xEB tjet\xEBr?"), /*#__PURE__*/React.createElement("div", {
    style: chStyles.bubMeta
  }, "14:18"))), /*#__PURE__*/React.createElement("div", {
    style: chStyles.systemNote
  }, "Ti more bised\xEBn n\xEB dor\xEB"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...chStyles.bubbleRow,
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "70%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...chStyles.bubble,
      background: "#1F5D86",
      color: "#fff",
      borderTopRightRadius: 4
    }
  }, "Endi, e premtja n\xEB 16:30 \xEBsht\xEB e lir\xEB. T\xEB shkon kjo or\xEB?"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...chStyles.bubMeta,
      textAlign: "right"
    }
  }, "14:21 \xB7 u d\xEBrgua"))), /*#__PURE__*/React.createElement("div", {
    style: chStyles.bubbleRow
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "70%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...chStyles.bubble,
      background: "#fff",
      border: "1px solid #e3e7ed",
      borderTopLeftRadius: 4
    }
  }, "Po, p\xEBrshtatet. Faleminderit."), /*#__PURE__*/React.createElement("div", {
    style: chStyles.bubMeta
  }, "14:24")))), /*#__PURE__*/React.createElement("div", {
    style: chStyles.composer
  }, /*#__PURE__*/React.createElement("div", {
    style: chStyles.composerHandoff
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "handoff",
    size: 14,
    color: "#1F5D86"
  }), /*#__PURE__*/React.createElement("span", null, "Ktheja Medium-it")), /*#__PURE__*/React.createElement("input", {
    placeholder: "Shkruaj nj\xEB mesazh\u2026",
    style: chStyles.composerInput
  }), /*#__PURE__*/React.createElement("button", {
    style: chStyles.sendBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "send",
    size: 16,
    color: "#fff"
  })))));
};
const chStyles = {
  root: {
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    gap: 0,
    flex: 1,
    minHeight: 0,
    background: "#fff",
    border: "1px solid #e3e7ed",
    borderRadius: 10,
    overflow: "hidden",
    margin: 24
  },
  list: {
    borderRight: "1px solid #e3e7ed",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column"
  },
  listHead: {
    display: "flex",
    gap: 16,
    padding: "14px 16px",
    borderBottom: "1px solid #eef0f4",
    fontSize: 12,
    color: "#6b7280"
  },
  listFilter: {
    fontSize: 12,
    color: "#6b7280"
  },
  row: {
    display: "flex",
    gap: 10,
    padding: "12px 16px",
    borderBottom: "1px solid #eef0f4",
    cursor: "pointer",
    alignItems: "center"
  },
  rowActive: {
    background: "#f7f8fa"
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    background: "#ecf3f9",
    color: "#113a55",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: '"Inter Tight", sans-serif',
    fontWeight: 600,
    fontSize: 12,
    flexShrink: 0
  },
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 2
  },
  rowBot: {
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  name: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0F1420",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  time: {
    fontSize: 11,
    color: "#8d95a3",
    flexShrink: 0,
    marginLeft: 8,
    fontFamily: '"JetBrains Mono", monospace'
  },
  snippet: {
    fontSize: 12,
    color: "#6b7280",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flex: 1
  },
  tag: {
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 999,
    fontWeight: 500,
    flexShrink: 0
  },
  unread: {
    background: "#1F5D86",
    color: "#fff",
    fontSize: 10,
    fontWeight: 600,
    padding: "1px 6px",
    borderRadius: 999,
    fontVariantNumeric: "tabular-nums"
  },
  thread: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0
  },
  threadHead: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 20px",
    borderBottom: "1px solid #eef0f4"
  },
  threadMeta: {
    fontSize: 12,
    color: "#8d95a3",
    fontFamily: '"JetBrains Mono", monospace',
    marginTop: 2
  },
  threadBody: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "#f7f8fa"
  },
  systemNote: {
    textAlign: "center",
    fontSize: 11,
    color: "#8d95a3",
    fontFamily: '"JetBrains Mono", monospace'
  },
  bubbleRow: {
    display: "flex"
  },
  bubble: {
    padding: "9px 12px",
    borderRadius: 12,
    fontSize: 14,
    lineHeight: 1.45
  },
  bubMeta: {
    fontSize: 10,
    color: "#8d95a3",
    padding: "3px 4px 0"
  },
  aiTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    fontFamily: '"JetBrains Mono", monospace',
    color: "#1F5D86",
    marginBottom: 3
  },
  aiDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: "#7CC4A8"
  },
  composer: {
    display: "flex",
    gap: 8,
    padding: "12px 20px",
    borderTop: "1px solid #eef0f4",
    alignItems: "center"
  },
  composerHandoff: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 32,
    padding: "0 10px",
    color: "#1F5D86",
    border: "1px solid #d4e3f0",
    background: "#ecf3f9",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer"
  },
  composerInput: {
    flex: 1,
    height: 36,
    padding: "0 12px",
    border: "1px solid #d4dae3",
    borderRadius: 6,
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    outline: "none"
  },
  sendBtn: {
    width: 36,
    height: 36,
    background: "#1F5D86",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer"
  }
};
window.ChatsScreen = ChatsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/ChatsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/Icon.jsx
try { (() => {
// Shared icon set — Lucide-style, 1.5px stroke, 20px default
const Icon = ({
  name,
  size = 20,
  color = "currentColor",
  strokeWidth = 1.5
}) => {
  const paths = {
    calendar: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "4",
      width: "18",
      height: "18",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 2v4M8 2v4M3 10h18"
    })),
    clock: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 7v5l3 2"
    })),
    message: /*#__PURE__*/React.createElement("path", {
      d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
    }),
    user: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "7",
      r: "4"
    })),
    users: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "9",
      cy: "7",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
    })),
    settings: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
    })),
    bell: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 21a2 2 0 0 0 4 0"
    })),
    check: /*#__PURE__*/React.createElement("path", {
      d: "M20 6 9 17l-5-5"
    }),
    x: /*#__PURE__*/React.createElement("path", {
      d: "M18 6 6 18M6 6l12 12"
    }),
    chevronRight: /*#__PURE__*/React.createElement("path", {
      d: "m9 18 6-6-6-6"
    }),
    chevronLeft: /*#__PURE__*/React.createElement("path", {
      d: "m15 18-6-6 6-6"
    }),
    chevronDown: /*#__PURE__*/React.createElement("path", {
      d: "m6 9 6 6 6-6"
    }),
    plus: /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14M5 12h14"
    }),
    search: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "11",
      cy: "11",
      r: "8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m21 21-4.3-4.3"
    })),
    send: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "m22 2-7 20-4-9-9-4Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M22 2 11 13"
    })),
    moreH: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "1"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "19",
      cy: "12",
      r: "1"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "5",
      cy: "12",
      r: "1"
    })),
    sparkle: /*#__PURE__*/React.createElement("path", {
      d: "M12 3 13.5 9l6 1.5L13.5 12 12 18l-1.5-6L4.5 10.5 10.5 9z"
    }),
    arrowRight: /*#__PURE__*/React.createElement("path", {
      d: "M5 12h14M13 5l7 7-7 7"
    }),
    phone: /*#__PURE__*/React.createElement("path", {
      d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
    }),
    home: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M9 22V12h6v10"
    })),
    pause: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "6",
      y: "4",
      width: "4",
      height: "16"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "4",
      width: "4",
      height: "16"
    })),
    play: /*#__PURE__*/React.createElement("path", {
      d: "m5 3 14 9-14 9z"
    }),
    handoff: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "m18 8 4 4-4 4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M2 12h20"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m6 16-4-4 4-4"
    }))
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0
    }
  }, paths[name] || null);
};
window.Icon = Icon;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/Icon.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/MobileScreens.jsx
try { (() => {
// All mobile screens in one file. Each is a self-contained component
// designed to render inside a 390×844 iPhone frame (no chrome of its own).

const StatusPill = ({
  status
}) => {
  const map = {
    confirmed: {
      label: "Konfirmuar",
      bg: "#ecf6f0",
      fg: "#246e47",
      dot: "#2f8b5a"
    },
    pending: {
      label: "Në pritje",
      bg: "#fcf4e6",
      fg: "#8c5c06",
      dot: "#b97a08"
    },
    noresp: {
      label: "Pa përgjigje",
      bg: "#eef0f4",
      fg: "#4b5563",
      dot: "#8d95a3"
    },
    cancelled: {
      label: "Anuluar",
      bg: "#fbecec",
      fg: "#8a2622",
      dot: "#b3322b"
    }
  };
  const s = map[status] || map.pending;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "3px 9px 3px 7px",
      borderRadius: 999,
      background: s.bg,
      color: s.fg,
      fontSize: 11,
      fontWeight: 500,
      lineHeight: 1.4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 5,
      height: 5,
      borderRadius: 999,
      background: s.dot
    }
  }), s.label);
};
const APPTS_M = [{
  id: 1,
  name: "Anila Hoxha",
  initials: "AH",
  time: "09:00",
  duration: "45 min",
  service: "Vlerësim i parë",
  status: "confirmed"
}, {
  id: 2,
  name: "Endi Kola",
  initials: "EK",
  time: "10:30",
  duration: "30 min",
  service: "Seancë vijuese",
  status: "pending"
}, {
  id: 3,
  name: "Genti Marku",
  initials: "GM",
  time: "11:30",
  duration: "60 min",
  service: "Terapi manuale",
  status: "confirmed"
}, {
  id: 4,
  name: "Vera Lleshi",
  initials: "VL",
  time: "14:30",
  duration: "30 min",
  service: "Seancë vijuese",
  status: "noresp"
}, {
  id: 5,
  name: "Dritan Sopa",
  initials: "DS",
  time: "15:30",
  duration: "45 min",
  service: "Vlerësim i parë",
  status: "confirmed"
}, {
  id: 6,
  name: "Mira Beqiri",
  initials: "MB",
  time: "16:30",
  duration: "30 min",
  service: "Seancë vijuese",
  status: "pending"
}];

// ───────────── Today (agenda)
const ScreenToday = () => /*#__PURE__*/React.createElement("div", {
  style: s_screen
}, /*#__PURE__*/React.createElement(MobileAppBar, {
  large: true,
  eyebrow: "E m\xEBrkur\xEB \xB7 6 maj",
  title: "Sot",
  right: /*#__PURE__*/React.createElement("button", {
    style: s_iconBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bell",
    size: 20,
    color: "#4b5563"
  }))
}), /*#__PURE__*/React.createElement("div", {
  style: s_body
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    padding: "0 16px 16px"
  }
}, [{
  l: "Takime",
  v: "12",
  d: "↑ 3 nga e martja",
  c: "#246e47"
}, {
  l: "Konfirmuara",
  v: "9",
  d: "75% e takimeve",
  c: "#8d95a3"
}, {
  l: "Pa përgjigje",
  v: "2",
  d: "kërkojnë shqyrtim",
  c: "#8c5c06"
}, {
  l: "Të reja sot",
  v: "4",
  d: "rezervuar nga Medium",
  c: "#113a55"
}].map((s, i) => /*#__PURE__*/React.createElement("div", {
  key: i,
  style: s_kpi
}, /*#__PURE__*/React.createElement("div", {
  style: s_kpiLabel
}, s.l), /*#__PURE__*/React.createElement("div", {
  style: s_kpiNum
}, s.v), /*#__PURE__*/React.createElement("div", {
  style: {
    ...s_kpiDelta,
    color: s.c
  }
}, s.d)))), /*#__PURE__*/React.createElement("div", {
  style: {
    padding: "0 16px 6px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: s_section
}, "Takimet sot"), /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 12,
    color: "#1F5D86",
    fontWeight: 500
  }
}, "Shiko t\xEB gjitha")), /*#__PURE__*/React.createElement("div", {
  style: {
    padding: "0 16px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 8
  }
}, APPTS_M.map(a => /*#__PURE__*/React.createElement("div", {
  key: a.id,
  style: s_apptRow
}, /*#__PURE__*/React.createElement("div", {
  style: s_time
}, a.time), /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1,
    minWidth: 0
  }
}, /*#__PURE__*/React.createElement("div", {
  style: s_name
}, a.name), /*#__PURE__*/React.createElement("div", {
  style: s_who
}, a.service, " \xB7 ", a.duration)), /*#__PURE__*/React.createElement(StatusPill, {
  status: a.status
}))))));

// ───────────── Calendar (day view, scrollable)
const ScreenCalendar = () => {
  const days = [{
    d: 4,
    n: "h",
    on: false
  }, {
    d: 5,
    n: "m",
    on: false
  }, {
    d: 6,
    n: "m",
    on: true
  }, {
    d: 7,
    n: "e",
    on: false
  }, {
    d: 8,
    n: "p",
    on: false
  }, {
    d: 9,
    n: "sh",
    on: false
  }, {
    d: 10,
    n: "d",
    on: false
  }];
  const hours = [9, 10, 11, 12, 13, 14, 15, 16];
  const HOUR_H = 56;
  return /*#__PURE__*/React.createElement("div", {
    style: s_screen
  }, /*#__PURE__*/React.createElement(MobileAppBar, {
    title: "Kalendari",
    right: /*#__PURE__*/React.createElement("button", {
      style: s_iconBtn
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 22,
      color: "#1F5D86"
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 12px 6px",
      background: "#fff"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '"Inter Tight", sans-serif',
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: "-0.02em",
      padding: "0 6px 8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", null, "Maj 2026"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "#1F5D86",
      fontWeight: 500
    }
  }, "Java")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: 4
    }
  }, days.map((dd, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      textAlign: "center",
      padding: "6px 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#8d95a3",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      marginBottom: 4
    }
  }, dd.n), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      margin: "0 auto",
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: dd.on ? "#1F5D86" : "transparent",
      color: dd.on ? "#fff" : "#0F1420",
      fontFamily: '"Inter Tight", sans-serif',
      fontWeight: 600,
      fontSize: 15,
      fontVariantNumeric: "tabular-nums"
    }
  }, dd.d))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      background: "#fff"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      padding: "8px 0"
    }
  }, hours.map(h => /*#__PURE__*/React.createElement("div", {
    key: h,
    style: {
      display: "flex",
      height: HOUR_H,
      borderTop: "1px solid #eef0f4"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 50,
      padding: "4px 8px 0",
      fontSize: 11,
      fontFamily: '"JetBrains Mono", monospace',
      color: "#8d95a3",
      textAlign: "right"
    }
  }, String(h).padStart(2, "0"), ":00"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }))), [{
    startH: 9,
    startM: 0,
    dur: 45,
    n: "Anila Hoxha",
    svc: "Vlerësim i parë",
    c: "conf"
  }, {
    startH: 10,
    startM: 30,
    dur: 30,
    n: "Endi Kola",
    svc: "Seancë vijuese",
    c: "pen"
  }, {
    startH: 14,
    startM: 30,
    dur: 30,
    n: "Vera Lleshi",
    svc: "Seancë vijuese",
    c: "nor"
  }].map((e, i) => {
    const top = (e.startH - hours[0] + e.startM / 60) * HOUR_H + 8;
    const height = e.dur / 60 * HOUR_H - 4;
    const cs = e.c === "conf" ? {
      bg: "#ecf3f9",
      fg: "#113a55",
      bar: "#1F5D86"
    } : e.c === "pen" ? {
      bg: "#fcf4e6",
      fg: "#8c5c06",
      bar: "#b97a08"
    } : {
      bg: "#eef0f4",
      fg: "#4b5563",
      bar: "#8d95a3"
    };
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        position: "absolute",
        left: 56,
        right: 12,
        top,
        height,
        background: cs.bg,
        color: cs.fg,
        borderLeft: `3px solid ${cs.bar}`,
        borderRadius: 6,
        padding: "5px 9px",
        fontSize: 12,
        lineHeight: 1.3,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600
      }
    }, e.n), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        opacity: 0.85
      }
    }, String(e.startH).padStart(2, "0"), ":", String(e.startM).padStart(2, "0"), " \xB7 ", e.svc));
  }))));
};

// ───────────── Chats list
const ScreenChats = () => {
  const convos = [{
    name: "Endi Kola",
    initials: "EK",
    state: "human",
    last: "Po, përshtatet. Faleminderit.",
    time: "2 min",
    unread: 2
  }, {
    name: "Anila Hoxha",
    initials: "AH",
    state: "ai",
    last: "Po, e enjtja në 14:30 është e përshtatshme.",
    time: "12 min",
    unread: 0
  }, {
    name: "Genti Marku",
    initials: "GM",
    state: "ai",
    last: "KONFIRMO",
    time: "1 orë",
    unread: 0
  }, {
    name: "Vera Lleshi",
    initials: "VL",
    state: "ai",
    last: "Faleminderit, takimin e ricaktuat.",
    time: "3 orë",
    unread: 0
  }, {
    name: "Dritan Sopa",
    initials: "DS",
    state: "ai",
    last: "Mund të kontrolloj orare?",
    time: "4 orë",
    unread: 1
  }, {
    name: "Mira Beqiri",
    initials: "MB",
    state: "closed",
    last: "Takimi përfundoi.",
    time: "dje",
    unread: 0
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: s_screen
  }, /*#__PURE__*/React.createElement(MobileAppBar, {
    large: true,
    title: "Bisedat",
    right: /*#__PURE__*/React.createElement("button", {
      style: s_iconBtn
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "search",
      size: 20,
      color: "#4b5563"
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 16px 12px",
      display: "flex",
      gap: 8
    }
  }, [{
    l: "Të gjitha",
    n: 6,
    on: true
  }, {
    l: "Pa përgjigje",
    n: 1,
    on: false
  }, {
    l: "Mbyllur",
    n: 24,
    on: false
  }].map((f, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: "6px 12px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 500,
      background: f.on ? "#0F1420" : "#eef0f4",
      color: f.on ? "#fff" : "#4b5563"
    }
  }, f.l, " \xB7 ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontVariantNumeric: "tabular-nums",
      opacity: 0.8
    }
  }, f.n)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      background: "#fff"
    }
  }, convos.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      gap: 12,
      padding: "12px 16px",
      borderBottom: "1px solid #eef0f4",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: s_avatar
  }, c.initials), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: "#0F1420"
    }
  }, c.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#8d95a3",
      fontFamily: '"JetBrains Mono", monospace'
    }
  }, c.time)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#6b7280",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      flex: 1
    }
  }, c.last), c.state === "ai" && /*#__PURE__*/React.createElement("span", {
    style: s_tag(true)
  }, "Medium"), c.state === "human" && /*#__PURE__*/React.createElement("span", {
    style: {
      ...s_tag(false),
      background: "#ecf6f0",
      color: "#246e47"
    }
  }, "Ti"), c.unread > 0 && /*#__PURE__*/React.createElement("span", {
    style: s_unread
  }, c.unread)))))));
};

// ───────────── Single chat thread (with takeover)
const ScreenChatThread = () => /*#__PURE__*/React.createElement("div", {
  style: s_screen
}, /*#__PURE__*/React.createElement(MobileAppBar, {
  onBack: () => {},
  title: "Endi Kola",
  right: /*#__PURE__*/React.createElement("button", {
    style: s_iconBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "phone",
    size: 20,
    color: "#1F5D86"
  }))
}), /*#__PURE__*/React.createElement("div", {
  style: {
    padding: "8px 16px 4px",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #eef0f4"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 11,
    color: "#8d95a3",
    fontFamily: '"JetBrains Mono", monospace'
  }
}, "+355 69 234 5678 \xB7 WhatsApp"), /*#__PURE__*/React.createElement("span", {
  style: {
    ...s_tag(false),
    background: "#ecf6f0",
    color: "#246e47"
  }
}, "\u25CF Ti po bisedon")), /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1,
    overflowY: "auto",
    background: "#f7f8fa",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10
  }
}, /*#__PURE__*/React.createElement("div", {
  style: s_sysNote
}, "4 maj \xB7 pacienti nisi bised\xEBn"), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    maxWidth: "80%"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    ...s_bubble,
    background: "#fff",
    border: "1px solid #e3e7ed",
    borderTopLeftRadius: 4
  }
}, "Mir\xEBdita, dua t\xEB ricaktoj takimin e s\xEB enjtes."), /*#__PURE__*/React.createElement("div", {
  style: s_bubMeta
}, "14:18"))), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    maxWidth: "80%"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    fontFamily: '"JetBrains Mono", monospace',
    color: "#1F5D86",
    marginBottom: 3
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: "#7CC4A8"
  }
}), "MEDIUM"), /*#__PURE__*/React.createElement("div", {
  style: {
    ...s_bubble,
    background: "#ecf3f9",
    color: "#113a55",
    borderTopLeftRadius: 4
  }
}, "Sigurisht. Cila dit\xEB ju shkon \u2014 e premte ose e h\xEBn\xEB tjet\xEBr?"), /*#__PURE__*/React.createElement("div", {
  style: s_bubMeta
}, "14:18"))), /*#__PURE__*/React.createElement("div", {
  style: s_sysNote
}, "Ti more bised\xEBn n\xEB dor\xEB"), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    justifyContent: "flex-end"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    maxWidth: "80%"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    ...s_bubble,
    background: "#1F5D86",
    color: "#fff",
    borderTopRightRadius: 4
  }
}, "Endi, e premtja n\xEB 16:30 \xEBsht\xEB e lir\xEB. T\xEB shkon kjo or\xEB?"), /*#__PURE__*/React.createElement("div", {
  style: {
    ...s_bubMeta,
    textAlign: "right"
  }
}, "14:21 \xB7 u d\xEBrgua"))), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    maxWidth: "80%"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    ...s_bubble,
    background: "#fff",
    border: "1px solid #e3e7ed",
    borderTopLeftRadius: 4
  }
}, "Po, p\xEBrshtatet. Faleminderit."), /*#__PURE__*/React.createElement("div", {
  style: s_bubMeta
}, "14:24")))), /*#__PURE__*/React.createElement("div", {
  style: {
    padding: "10px 12px",
    background: "#fff",
    borderTop: "1px solid #eef0f4",
    display: "flex",
    flexDirection: "column",
    gap: 8
  }
}, /*#__PURE__*/React.createElement("button", {
  style: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 32,
    padding: "0 12px",
    color: "#1F5D86",
    border: "1px solid #d4e3f0",
    background: "#ecf3f9",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: "handoff",
  size: 13,
  color: "#1F5D86"
}), "Ktheja Medium-it"), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    gap: 8
  }
}, /*#__PURE__*/React.createElement("input", {
  placeholder: "Shkruaj\u2026",
  style: {
    flex: 1,
    height: 38,
    padding: "0 14px",
    border: "1px solid #d4dae3",
    borderRadius: 999,
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    outline: "none"
  }
}), /*#__PURE__*/React.createElement("button", {
  style: {
    width: 38,
    height: 38,
    background: "#1F5D86",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center"
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: "send",
  size: 16,
  color: "#fff"
})))));

// ───────────── Appointment detail
const ScreenApptDetail = () => /*#__PURE__*/React.createElement("div", {
  style: s_screen
}, /*#__PURE__*/React.createElement(MobileAppBar, {
  onBack: () => {},
  title: "Detajet",
  right: /*#__PURE__*/React.createElement("button", {
    style: s_iconBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "moreH",
    size: 20,
    color: "#4b5563"
  }))
}), /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1,
    overflowY: "auto",
    background: "#f7f8fa"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    background: "#fff",
    padding: "20px 16px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    borderBottom: "1px solid #eef0f4"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    ...s_avatar,
    width: 52,
    height: 52,
    fontSize: 16
  }
}, "AH"), /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1,
    minWidth: 0
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    fontFamily: '"Inter Tight", sans-serif',
    fontSize: 19,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: "#0F1420"
  }
}, "Anila Hoxha"), /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 12,
    color: "#8d95a3",
    fontFamily: '"JetBrains Mono", monospace',
    marginTop: 2
  }
}, "+355 69 123 4567")), /*#__PURE__*/React.createElement(StatusPill, {
  status: "confirmed"
})), /*#__PURE__*/React.createElement("div", {
  style: {
    background: "#fff",
    padding: "14px 16px",
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10
  }
}, [{
  i: "clock",
  l: "Kohëzgjatja",
  v: "E mërkurë, 6 maj · 09:00 (45 min)"
}, {
  i: "user",
  l: "Shërbimi",
  v: "Vlerësim i parë"
}, {
  i: "bell",
  l: "Kujtesa",
  v: "U dërgua më 5 maj · u konfirmua"
}].map((m, i) => /*#__PURE__*/React.createElement("div", {
  key: i,
  style: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    fontSize: 13
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: m.i,
  size: 16,
  color: "#8d95a3"
}), /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    color: "#8d95a3",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase"
  }
}, m.l), /*#__PURE__*/React.createElement("div", {
  style: {
    color: "#0F1420",
    marginTop: 2
  }
}, m.v))))), /*#__PURE__*/React.createElement("div", {
  style: {
    background: "#fff",
    marginTop: 10,
    padding: "14px 16px"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 13,
    fontWeight: 600
  }
}, "Biseda me Medium"), /*#__PURE__*/React.createElement("span", {
  style: {
    ...s_tag(true)
  }
}, "\u25CF automatik")), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    ...s_bubble,
    fontSize: 13,
    background: "#f7f8fa",
    maxWidth: "85%",
    borderTopLeftRadius: 4
  }
}, "Mir\xEBm\xEBngjes, dua nj\xEB takim k\xEBt\xEB jav\xEB.")), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    maxWidth: "85%"
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 9,
    fontFamily: '"JetBrains Mono", monospace',
    color: "#1F5D86",
    marginBottom: 2
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    width: 5,
    height: 5,
    borderRadius: 999,
    background: "#7CC4A8"
  }
}), "MEDIUM"), /*#__PURE__*/React.createElement("div", {
  style: {
    ...s_bubble,
    fontSize: 13,
    background: "#ecf3f9",
    color: "#113a55",
    borderTopLeftRadius: 4
  }
}, "Sigurisht. Vler\xEBsim i par\xEB apo seanc\xEB vijuese?"))), /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 12,
    color: "#1F5D86",
    fontWeight: 500,
    padding: "6px 0 0"
  }
}, "Shiko bised\xEBn e plot\xEB \u2192")))), /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    gap: 8,
    padding: "10px 12px 16px",
    background: "#fff",
    borderTop: "1px solid #eef0f4"
  }
}, /*#__PURE__*/React.createElement("button", {
  style: {
    flex: 1,
    height: 40,
    background: "#fff",
    color: "#b3322b",
    border: "1px solid #d4dae3",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500
  }
}, "Anulo"), /*#__PURE__*/React.createElement("button", {
  style: {
    flex: 1,
    height: 40,
    background: "#fff",
    color: "#4b5563",
    border: "1px solid #d4dae3",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500
  }
}, "Ricakto"), /*#__PURE__*/React.createElement("button", {
  style: {
    flex: 1.4,
    height: 40,
    background: "#1F5D86",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: "message",
  size: 14,
  color: "#fff"
}), "Mesazh")));

// ───────────── Availability settings
const ScreenAvail = () => {
  const days = [{
    n: "E hënë",
    v: "09:00 → 17:00",
    on: true
  }, {
    n: "E martë",
    v: "09:00 → 17:00",
    on: true
  }, {
    n: "E mërkurë",
    v: "09:00 → 17:00",
    on: true
  }, {
    n: "E enjte",
    v: "09:00 → 13:00",
    on: true
  }, {
    n: "E premte",
    v: "09:00 → 17:00",
    on: true
  }, {
    n: "E shtunë",
    v: "—",
    on: false
  }, {
    n: "E diel",
    v: "—",
    on: false
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: s_screen
  }, /*#__PURE__*/React.createElement(MobileAppBar, {
    large: true,
    title: "Disponueshm\xEBria"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "0 16px 24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "#8d95a3",
      padding: "4px 4px 8px"
    }
  }, "Orari javor"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "1px solid #e3e7ed",
      borderRadius: 10,
      overflow: "hidden"
    }
  }, days.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 14px",
      borderTop: i === 0 ? "none" : "1px solid #eef0f4"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 18,
      borderRadius: 999,
      background: d.on ? "#1F5D86" : "#d4dae3",
      position: "relative",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 2,
      width: 14,
      height: 14,
      borderRadius: 999,
      background: "#fff",
      transform: d.on ? "translateX(14px)" : "translateX(2px)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 14,
      fontWeight: 500,
      color: d.on ? "#0F1420" : "#8d95a3"
    }
  }, d.n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontFamily: '"JetBrains Mono", monospace',
      color: d.on ? "#0F1420" : "#b6bdc9"
    }
  }, d.v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "#8d95a3",
      padding: "20px 4px 8px"
    }
  }, "Koh\xEBzgjatja"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "1px solid #e3e7ed",
      borderRadius: 10,
      padding: "12px 14px",
      display: "flex",
      gap: 8
    }
  }, [30, 45, 60, 90].map(m => /*#__PURE__*/React.createElement("button", {
    key: m,
    style: {
      flex: 1,
      padding: "8px 0",
      borderRadius: 6,
      background: m === 45 ? "#1F5D86" : "transparent",
      color: m === 45 ? "#fff" : "#4b5563",
      border: m === 45 ? "none" : "1px solid #d4dae3",
      fontFamily: "Inter, sans-serif",
      fontSize: 12,
      fontWeight: 500
    }
  }, m, " min"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "#8d95a3",
      padding: "20px 4px 8px"
    }
  }, "Kujtesa automatike"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "1px solid #e3e7ed",
      borderRadius: 10,
      padding: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontFamily: '"JetBrains Mono", monospace',
      color: "#8d95a3",
      marginBottom: 8
    }
  }, "WhatsApp template \xB7 sq"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#f7f8fa",
      padding: "10px 12px",
      borderRadius: 10,
      fontSize: 12,
      lineHeight: 1.5
    }
  }, "Kujtes\xEB: keni nj\xEB takim me ", /*#__PURE__*/React.createElement("strong", null, "Dr. Hoxh\xEBn"), " nes\xEBr n\xEB ", /*#__PURE__*/React.createElement("strong", null, "14:30"), ". P\xEBrgjigjuni ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 11,
      padding: "1px 4px",
      background: "#eef0f4",
      borderRadius: 3,
      color: "#1F5D86"
    }
  }, "KONFIRMO"), " ose ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 11,
      padding: "1px 4px",
      background: "#eef0f4",
      borderRadius: 3,
      color: "#1F5D86"
    }
  }, "ANULO"), "."))));
};

// ───────────── Shared style fragments
const s_screen = {
  width: "100%",
  height: "100%",
  background: "#f7f8fa",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  fontFamily: "Inter, sans-serif"
};
const s_body = {
  flex: 1,
  overflowY: "auto"
};
const s_iconBtn = {
  width: 36,
  height: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  borderRadius: 999
};
const s_section = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#8d95a3",
  padding: "10px 0 4px"
};
const s_kpi = {
  background: "#fff",
  border: "1px solid #e3e7ed",
  borderRadius: 10,
  padding: "12px 14px"
};
const s_kpiLabel = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#8d95a3"
};
const s_kpiNum = {
  fontFamily: '"Inter Tight", sans-serif',
  fontWeight: 600,
  fontSize: 26,
  letterSpacing: "-0.025em",
  color: "#0F1420",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
  marginTop: 6
};
const s_kpiDelta = {
  fontSize: 10,
  fontFamily: '"JetBrains Mono", monospace',
  marginTop: 6
};
const s_apptRow = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  background: "#fff",
  border: "1px solid #e3e7ed",
  borderRadius: 10
};
const s_time = {
  fontFamily: '"Inter Tight", sans-serif',
  fontWeight: 600,
  fontSize: 16,
  color: "#0F1420",
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums",
  width: 48
};
const s_name = {
  fontSize: 14,
  fontWeight: 600,
  color: "#0F1420"
};
const s_who = {
  fontSize: 12,
  color: "#8d95a3",
  marginTop: 2
};
const s_avatar = {
  width: 40,
  height: 40,
  borderRadius: 999,
  background: "#ecf3f9",
  color: "#113a55",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: '"Inter Tight", sans-serif',
  fontWeight: 600,
  fontSize: 13,
  flexShrink: 0
};
const s_tag = ai => ({
  fontSize: 10,
  padding: "2px 6px",
  borderRadius: 999,
  fontWeight: 500,
  background: ai ? "#ecf3f9" : "#eef0f4",
  color: ai ? "#113a55" : "#4b5563",
  flexShrink: 0
});
const s_unread = {
  background: "#1F5D86",
  color: "#fff",
  fontSize: 10,
  fontWeight: 600,
  padding: "1px 6px",
  borderRadius: 999,
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0
};
const s_sysNote = {
  textAlign: "center",
  fontSize: 10,
  color: "#8d95a3",
  fontFamily: '"JetBrains Mono", monospace'
};
const s_bubble = {
  padding: "9px 12px",
  borderRadius: 14,
  fontSize: 14,
  lineHeight: 1.45
};
const s_bubMeta = {
  fontSize: 10,
  color: "#8d95a3",
  padding: "3px 6px 0"
};
window.ScreenToday = ScreenToday;
window.ScreenCalendar = ScreenCalendar;
window.ScreenChats = ScreenChats;
window.ScreenChatThread = ScreenChatThread;
window.ScreenApptDetail = ScreenApptDetail;
window.ScreenAvail = ScreenAvail;
window.StatusPill = StatusPill;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/MobileScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/MobileShell.jsx
try { (() => {
// Bottom tab bar for the mobile PWA — 5 tabs, iOS-friendly safe area
const BottomTabs = ({
  active,
  onNav
}) => {
  const items = [{
    id: "today",
    label: "Sot",
    icon: "home"
  }, {
    id: "calendar",
    label: "Kalendari",
    icon: "calendar"
  }, {
    id: "chats",
    label: "Bisedat",
    icon: "message",
    badge: 3
  }, {
    id: "patients",
    label: "Pacientët",
    icon: "users"
  }, {
    id: "settings",
    label: "Ti",
    icon: "settings"
  }];
  return /*#__PURE__*/React.createElement("nav", {
    style: btStyles.bar
  }, items.map(it => {
    const a = active === it.id;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      onClick: () => onNav(it.id),
      style: btStyles.tab
    }, /*#__PURE__*/React.createElement("div", {
      style: btStyles.iconWrap
    }, /*#__PURE__*/React.createElement(Icon, {
      name: it.icon,
      size: 22,
      color: a ? "#1F5D86" : "#8d95a3",
      strokeWidth: a ? 2 : 1.5
    }), it.badge ? /*#__PURE__*/React.createElement("span", {
      style: btStyles.badge
    }, it.badge) : null), /*#__PURE__*/React.createElement("span", {
      style: {
        ...btStyles.label,
        color: a ? "#1F5D86" : "#8d95a3",
        fontWeight: a ? 600 : 500
      }
    }, it.label));
  }));
};
const btStyles = {
  bar: {
    display: "flex",
    alignItems: "stretch",
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderTop: "1px solid #e3e7ed",
    padding: "8px 8px 22px",
    flexShrink: 0
  },
  tab: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "4px 0"
  },
  iconWrap: {
    position: "relative"
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    padding: "0 4px",
    background: "#b3322b",
    color: "#fff",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px solid #fff"
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter, sans-serif",
    letterSpacing: "0.01em"
  }
};

// Top app bar — title + optional back / right action
const MobileAppBar = ({
  title,
  eyebrow,
  onBack,
  right,
  large
}) => /*#__PURE__*/React.createElement("header", {
  style: {
    padding: large ? "8px 20px 12px" : "12px 16px",
    background: "#fff",
    borderBottom: large ? "none" : "1px solid #e3e7ed",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0
  }
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 36
  }
}, onBack && /*#__PURE__*/React.createElement("button", {
  onClick: onBack,
  style: {
    width: 36,
    height: 36,
    marginLeft: -8,
    background: "transparent",
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    borderRadius: 999
  }
}, /*#__PURE__*/React.createElement(Icon, {
  name: "chevronLeft",
  size: 22,
  color: "#1F5D86",
  strokeWidth: 2
})), !large && /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1,
    fontFamily: '"Inter Tight", sans-serif',
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    color: "#0F1420",
    textAlign: onBack ? "center" : "left",
    marginRight: onBack ? 36 : 0
  }
}, title), large && /*#__PURE__*/React.createElement("div", {
  style: {
    flex: 1
  }
}), right), large && /*#__PURE__*/React.createElement("div", {
  style: {
    marginTop: 6
  }
}, eyebrow && /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8d95a3",
    marginBottom: 4
  }
}, eyebrow), /*#__PURE__*/React.createElement("h1", {
  style: {
    fontFamily: '"Inter Tight", sans-serif',
    fontSize: 30,
    fontWeight: 600,
    letterSpacing: "-0.025em",
    color: "#0F1420",
    margin: 0,
    lineHeight: 1.1
  }
}, title)));
window.BottomTabs = BottomTabs;
window.MobileAppBar = MobileAppBar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/MobileShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/PhoneFrame.jsx
try { (() => {
// Tiny iPhone frame — 390×844 logical, no liquid-glass overhead.
// Renders status bar, home indicator, and clips children to the screen rect.
const PhoneFrame = ({
  children,
  label,
  time = "9:41",
  screenBg = "#f7f8fa"
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14
  }
}, /*#__PURE__*/React.createElement("div", {
  style: pf.shell
}, /*#__PURE__*/React.createElement("div", {
  style: pf.bezel
}, /*#__PURE__*/React.createElement("div", {
  style: pf.screen
}, /*#__PURE__*/React.createElement("div", {
  style: pf.statusBar
}, /*#__PURE__*/React.createElement("div", {
  style: pf.timeText
}, time), /*#__PURE__*/React.createElement("div", {
  style: pf.notch
}), /*#__PURE__*/React.createElement("div", {
  style: pf.statusRight
}, /*#__PURE__*/React.createElement("svg", {
  width: "17",
  height: "11",
  viewBox: "0 0 17 11"
}, /*#__PURE__*/React.createElement("rect", {
  x: "0",
  y: "7",
  width: "3",
  height: "4",
  rx: "0.7",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("rect", {
  x: "4.5",
  y: "5",
  width: "3",
  height: "6",
  rx: "0.7",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("rect", {
  x: "9",
  y: "2.5",
  width: "3",
  height: "8.5",
  rx: "0.7",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("rect", {
  x: "13.5",
  y: "0",
  width: "3",
  height: "11",
  rx: "0.7",
  fill: "#0F1420"
})), /*#__PURE__*/React.createElement("svg", {
  width: "15",
  height: "11",
  viewBox: "0 0 17 12"
}, /*#__PURE__*/React.createElement("path", {
  d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "8.5",
  cy: "10.5",
  r: "1.3",
  fill: "#0F1420"
})), /*#__PURE__*/React.createElement("svg", {
  width: "24",
  height: "12",
  viewBox: "0 0 27 13"
}, /*#__PURE__*/React.createElement("rect", {
  x: "0.5",
  y: "0.5",
  width: "23",
  height: "12",
  rx: "3.5",
  stroke: "#0F1420",
  strokeOpacity: "0.35",
  fill: "none"
}), /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "2",
  width: "18",
  height: "9",
  rx: "2",
  fill: "#0F1420"
}), /*#__PURE__*/React.createElement("path", {
  d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
  fill: "#0F1420",
  fillOpacity: "0.4"
})))), /*#__PURE__*/React.createElement("div", {
  style: {
    ...pf.content,
    background: screenBg
  }
}, children), /*#__PURE__*/React.createElement("div", {
  style: pf.homeIndicator
}, /*#__PURE__*/React.createElement("div", {
  style: pf.homeBar
}))))), label && /*#__PURE__*/React.createElement("div", {
  style: pf.label
}, label));
const pf = {
  shell: {
    width: 390,
    height: 844,
    background: "#0F1420",
    borderRadius: 56,
    padding: 8,
    boxShadow: "0 30px 80px rgba(15, 20, 32, 0.18), 0 8px 24px rgba(15, 20, 32, 0.10), 0 1px 0 rgba(255,255,255,0.5) inset",
    flexShrink: 0
  },
  bezel: {
    width: "100%",
    height: "100%",
    background: "#000",
    borderRadius: 48,
    padding: 2
  },
  screen: {
    width: "100%",
    height: "100%",
    background: "#fff",
    borderRadius: 46,
    overflow: "hidden",
    position: "relative",
    display: "flex",
    flexDirection: "column"
  },
  statusBar: {
    height: 47,
    padding: "0 28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    position: "relative"
  },
  timeText: {
    fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
    fontWeight: 600,
    fontSize: 15,
    color: "#0F1420",
    fontVariantNumeric: "tabular-nums",
    minWidth: 60
  },
  notch: {
    position: "absolute",
    left: "50%",
    top: 11,
    transform: "translateX(-50%)",
    width: 120,
    height: 32,
    background: "#000",
    borderRadius: 999
  },
  statusRight: {
    display: "flex",
    alignItems: "center",
    gap: 5
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0
  },
  homeIndicator: {
    height: 24,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: 8,
    background: "transparent",
    flexShrink: 0
  },
  homeBar: {
    width: 134,
    height: 5,
    background: "#0F1420",
    borderRadius: 999
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8d95a3",
    fontFamily: "Inter, sans-serif"
  }
};
window.PhoneFrame = PhoneFrame;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/PhoneFrame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/Sidebar.jsx
try { (() => {
// Sidebar nav for the PWA dashboard
const Sidebar = ({
  active,
  onNav
}) => {
  const items = [{
    id: "today",
    label: "Sot",
    icon: "home"
  }, {
    id: "calendar",
    label: "Kalendari",
    icon: "calendar"
  }, {
    id: "chats",
    label: "Bisedat",
    icon: "message",
    badge: 3
  }, {
    id: "patients",
    label: "Pacientët",
    icon: "users"
  }, {
    id: "avail",
    label: "Disponueshmëria",
    icon: "clock"
  }];
  return /*#__PURE__*/React.createElement("aside", {
    style: sidebarStyles.root
  }, /*#__PURE__*/React.createElement("div", {
    style: sidebarStyles.brand
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "28",
    height: "28",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    style: sidebarStyles.brandText
  }, "Medium")), /*#__PURE__*/React.createElement("nav", {
    style: sidebarStyles.nav
  }, items.map(it => {
    const isActive = active === it.id;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      onClick: () => onNav(it.id),
      style: {
        ...sidebarStyles.item,
        ...(isActive ? sidebarStyles.itemActive : {})
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: it.icon,
      size: 18,
      color: isActive ? "#0F1420" : "#4b5563"
    }), /*#__PURE__*/React.createElement("span", {
      style: sidebarStyles.itemLabel
    }, it.label), it.badge ? /*#__PURE__*/React.createElement("span", {
      style: sidebarStyles.badge
    }, it.badge) : null);
  })), /*#__PURE__*/React.createElement("div", {
    style: sidebarStyles.foot
  }, /*#__PURE__*/React.createElement("div", {
    style: sidebarStyles.user
  }, /*#__PURE__*/React.createElement("div", {
    style: sidebarStyles.avatar
  }, "VH"), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: sidebarStyles.userName
  }, "Dr. Valbona Hoxha"), /*#__PURE__*/React.createElement("div", {
    style: sidebarStyles.userMeta
  }, "Fizioterapi \xB7 Tiran\xEB")), /*#__PURE__*/React.createElement(Icon, {
    name: "settings",
    size: 16,
    color: "#8d95a3"
  }))));
};
const sidebarStyles = {
  root: {
    width: 240,
    flexShrink: 0,
    height: "100%",
    background: "#fff",
    borderRight: "1px solid #e3e7ed",
    display: "flex",
    flexDirection: "column",
    padding: "20px 14px"
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 6px 18px",
    borderBottom: "1px solid #eef0f4",
    marginBottom: 10
  },
  brandText: {
    fontFamily: '"Inter Tight", sans-serif',
    fontWeight: 600,
    fontSize: 18,
    letterSpacing: "-0.02em",
    color: "#0F1420"
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    border: "none",
    background: "transparent",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    color: "#4b5563",
    fontWeight: 500,
    textAlign: "left",
    width: "100%"
  },
  itemActive: {
    background: "#eef0f4",
    color: "#0F1420",
    fontWeight: 600
  },
  itemLabel: {
    flex: 1
  },
  badge: {
    background: "#1F5D86",
    color: "#fff",
    fontSize: 11,
    fontWeight: 600,
    padding: "1px 6px",
    borderRadius: 999,
    lineHeight: 1.4,
    fontVariantNumeric: "tabular-nums"
  },
  foot: {
    borderTop: "1px solid #eef0f4",
    paddingTop: 12
  },
  user: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 6
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "#ecf3f9",
    color: "#113a55",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: '"Inter Tight", sans-serif',
    fontWeight: 600,
    fontSize: 12,
    flexShrink: 0
  },
  userName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#0F1420",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  userMeta: {
    fontSize: 11,
    color: "#8d95a3",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  }
};
window.Sidebar = Sidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/TodaySummary.jsx
try { (() => {
// TodaySummary — small KPI cards above the calendar
const TodaySummary = ({
  stats
}) => /*#__PURE__*/React.createElement("div", {
  style: tsStyles.row
}, stats.map((s, i) => /*#__PURE__*/React.createElement("div", {
  key: i,
  style: tsStyles.card
}, /*#__PURE__*/React.createElement("div", {
  style: tsStyles.label
}, s.label), /*#__PURE__*/React.createElement("div", {
  style: tsStyles.numRow
}, /*#__PURE__*/React.createElement("div", {
  style: tsStyles.num
}, s.value), s.delta ? /*#__PURE__*/React.createElement("div", {
  style: {
    ...tsStyles.delta,
    color: s.deltaColor || "#246e47"
  }
}, s.delta) : null))));
const tsStyles = {
  row: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 16
  },
  card: {
    background: "#fff",
    border: "1px solid #e3e7ed",
    borderRadius: 10,
    padding: "14px 16px"
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8d95a3",
    marginBottom: 6
  },
  numRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 10
  },
  num: {
    fontFamily: '"Inter Tight", sans-serif',
    fontWeight: 600,
    fontSize: 28,
    letterSpacing: "-0.025em",
    color: "#0F1420",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1
  },
  delta: {
    fontSize: 11,
    fontFamily: '"JetBrains Mono", monospace'
  }
};
window.TodaySummary = TodaySummary;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/TodaySummary.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/TopBar.jsx
try { (() => {
// Top bar — title, search, primary action
const TopBar = ({
  title,
  subtitle,
  onNew
}) => /*#__PURE__*/React.createElement("header", {
  style: topbarStyles.root
}, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
  style: topbarStyles.eyebrow
}, "E m\xEBrkur\xEB \xB7 6 maj"), /*#__PURE__*/React.createElement("h1", {
  style: topbarStyles.title
}, title), subtitle ? /*#__PURE__*/React.createElement("div", {
  style: topbarStyles.subtitle
}, subtitle) : null), /*#__PURE__*/React.createElement("div", {
  style: topbarStyles.right
}, /*#__PURE__*/React.createElement("div", {
  style: topbarStyles.search
}, /*#__PURE__*/React.createElement(Icon, {
  name: "search",
  size: 16,
  color: "#8d95a3"
}), /*#__PURE__*/React.createElement("input", {
  placeholder: "K\xEBrko pacient ose takim",
  style: topbarStyles.searchInput
})), /*#__PURE__*/React.createElement("button", {
  style: topbarStyles.iconBtn,
  "aria-label": "Njoftime"
}, /*#__PURE__*/React.createElement(Icon, {
  name: "bell",
  size: 18,
  color: "#4b5563"
}), /*#__PURE__*/React.createElement("span", {
  style: topbarStyles.notifDot
})), /*#__PURE__*/React.createElement("button", {
  style: topbarStyles.primary,
  onClick: onNew
}, /*#__PURE__*/React.createElement(Icon, {
  name: "plus",
  size: 16,
  color: "#fff"
}), /*#__PURE__*/React.createElement("span", null, "Takim i ri"))));
const topbarStyles = {
  root: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    padding: "20px 28px 16px",
    borderBottom: "1px solid #e3e7ed",
    background: "#fff",
    gap: 24
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8d95a3",
    marginBottom: 6
  },
  title: {
    fontFamily: '"Inter Tight", sans-serif',
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: "-0.025em",
    color: "#0F1420",
    margin: 0,
    lineHeight: 1.15
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 10
  },
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 12px",
    height: 36,
    background: "#f7f8fa",
    border: "1px solid transparent",
    borderRadius: 6,
    width: 280
  },
  searchInput: {
    border: "none",
    background: "transparent",
    outline: "none",
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    color: "#0F1420",
    flex: 1
  },
  iconBtn: {
    position: "relative",
    width: 36,
    height: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#fff",
    border: "1px solid #e3e7ed",
    borderRadius: 6,
    cursor: "pointer"
  },
  notifDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 999,
    background: "#b3322b",
    border: "1.5px solid #fff"
  },
  primary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 36,
    padding: "0 14px",
    background: "#1F5D86",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer"
  }
};
window.TopBar = TopBar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/TopBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pwa/ios-frame.jsx
try { (() => {
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports: IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pwa/ios-frame.jsx", error: String((e && e.message) || e) }); }

})();
