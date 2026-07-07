// Today + Calendar — compose every screen. Look locked: calm / blue / soft.
applyTheme({ atmosphere: "calm", accent: "blue", shape: "soft" });

const CF = PhoneFrame;
const W = 446, H = 918;

const CalApp = () => (
  <DesignCanvas>
    <DCSection id="today" title="Sot" subtitle="Exception-first home · default / loading / quiet-day">
      <DCArtboard id="today-default" label="Sot" width={W} height={H}><CF><TodayDefault /></CF></DCArtboard>
      <DCArtboard id="today-loading" label="Po ngarkohet" width={W} height={H}><CF><TodayLoading /></CF></DCArtboard>
      <DCArtboard id="today-empty" label="Ditë e qetë" width={W} height={H}><CF><TodayEmpty /></CF></DCArtboard>
    </DCSection>

    <DCSection id="calendar" title="Kalendari" subtitle="Day · week · month · empty · loading">
      <DCArtboard id="cal-day" label="Pamja ditore" width={W} height={H}><CF><CalDay /></CF></DCArtboard>
      <DCArtboard id="cal-week" label="Pamja javore" width={W} height={H}><CF><CalWeek /></CF></DCArtboard>
      <DCArtboard id="cal-month" label="Pamja mujore" width={W} height={H}><CF><CalMonth /></CF></DCArtboard>
      <DCArtboard id="cal-empty" label="Ditë bosh" width={W} height={H}><CF><CalDayEmpty /></CF></DCArtboard>
      <DCArtboard id="cal-loading" label="Po ngarkohet" width={W} height={H}><CF><CalLoading /></CF></DCArtboard>
    </DCSection>

    <DCSection id="statuses" title="Statuset e takimeve" subtitle="Full lifecycle dots & pills + offline pending-sync chips">
      <DCArtboard id="status-variants" label="Të gjitha statuset" width={W} height={H}><CF><StatusVariants /></CF></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById("root")).render(<CalApp />);
