import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { Clock, Database, FileText, Shield, Users, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

const clockFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function DashboardClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card className="border-white/20 bg-white/10 backdrop-blur-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-700 shadow-lg">
          <Clock className="h-8 w-8 text-white" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl text-white">Digital Clock</CardTitle>
        <CardDescription className="text-gray-300">India Standard Time</CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <time className="font-mono text-3xl font-semibold tabular-nums text-white" dateTime={now.toISOString()}>
          {clockFormat.format(now)}
        </time>
      </CardContent>
    </Card>
  );
}

const modules: Array<{
  title: string;
  description: string;
  action: string;
  to: string;
  Icon: LucideIcon;
  iconClass: string;
  actionClass: string;
}> = [
  {
    title: "Certificates",
    description: "Create new certificates or manage certificates already issued.",
    action: "Open Certificates",
    to: "/generate",
    Icon: FileText,
    iconClass: "bg-gradient-to-br from-blue-500 to-blue-700",
    actionClass: "bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800",
  },
  {
    title: "Mark Sheets",
    description: "Create, find, edit, and download student mark sheets.",
    action: "Open Mark Sheets",
    to: "/marksheets",
    Icon: Database,
    iconClass: "bg-gradient-to-br from-cyan-500 to-cyan-700",
    actionClass: "bg-gradient-to-r from-cyan-600 to-cyan-800 hover:from-cyan-700 hover:to-cyan-900",
  },
  {
    title: "Students",
    description: "Add, search, update, archive, and restore student records.",
    action: "Open Student Records",
    to: "/students",
    Icon: Users,
    iconClass: "bg-indigo-700",
    actionClass: "bg-indigo-700 hover:bg-indigo-800",
  },
  {
    title: "Verify Certificate",
    description: "Check a certificate using its QR code or certificate ID.",
    action: "Verify Certificate",
    to: "/verify",
    Icon: Shield,
    iconClass: "bg-gradient-to-br from-green-500 to-green-700",
    actionClass: "bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800",
  },
];

const Index = () => (
  <div className="relative min-h-screen overflow-hidden">
    <div className="absolute inset-0 bg-black/40" />
    <main className="container relative z-10 mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto mb-7 max-w-6xl">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-200">Choose a work area to get started.</p>
      </div>
      <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map(({ title, description, action, to, Icon, iconClass, actionClass }) => (
          <Card key={to} className="border-white/20 bg-white/10 backdrop-blur-lg transition-all duration-300 hover:bg-white/15 hover:shadow-xl">
            <Link to={to} className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <CardHeader className="text-center">
                <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full shadow-lg ${iconClass}`}>
                  <Icon className="h-8 w-8 text-white" aria-hidden="true" />
                </div>
                <CardTitle className="text-xl text-white">{title}</CardTitle>
                <CardDescription className="text-gray-300">{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`w-full rounded-md px-4 py-3 text-center font-medium text-white transition-colors ${actionClass}`}>{action}</div>
              </CardContent>
            </Link>
          </Card>
        ))}
        <DashboardClock />
      </div>
    </main>
  </div>
);

export default Index;
