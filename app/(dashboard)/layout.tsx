export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="bg-muted/20 min-h-screen">{children}</div>;
}
