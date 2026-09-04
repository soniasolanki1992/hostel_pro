"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, Calendar, Briefcase, MessageSquare, Heart, Settings, LogOut } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shadcn/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

interface EventItem { id: string; title: string; date: string; location: string; status: string }
interface JobItem { id: string; title: string; company: string; location: string; status: string; postedBy: { name: string; batch: string } }

const AlumniDashboard = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const [session, setSession] = useState<{ email: string; status: string } | null>(null);
  const [counts, setCounts] = useState({ alumni: 0, events: 0, jobs: 0 });
  const [events, setEvents] = useState<EventItem[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const role = typeof window !== 'undefined' ? localStorage.getItem('userRole') : null;
    if (!token || role !== 'ALUMNI') {
      router.push('/alumni/login');
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    (async () => {
      try {
        const [meRes, dirRes, evRes, jbRes] = await Promise.all([
          fetch('/api/alumni/me', { headers }),
          fetch('/api/alumni/directory', { headers }),
          fetch('/api/alumni/events?status=upcoming'),
          fetch('/api/alumni/jobs'),
        ]);
        const me = await meRes.json();
        if (meRes.ok && me.success) setSession({ email: me.data.email, status: me.data.status });
        const dir = await dirRes.json();
        const ev = await evRes.json();
        const jb = await jbRes.json();
        setCounts({
          alumni: dir.success ? dir.data.length : 0,
          events: ev.success ? ev.data.length : 0,
          jobs: jb.success ? jb.data.length : 0,
        });
        if (ev.success) setEvents(ev.data);
        if (jb.success) setJobs(jb.data);
      } catch {
        toast.error(t('Failed to load dashboard', 'डैशबोर्ड लोड करने में विफल'));
      }
    })();
  }, [router, t]);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('alumniId');
    toast.success(t('You have been successfully logged out.', 'आप सफलतापूर्वक लॉग आउट हो गए हैं।'));
    router.push('/alumni');
  };

  const stats = [
    {
      label: t('Total Alumni', 'कुल पूर्व छात्र'),
      value: counts.alumni,
      icon: Users,
      color: 'bg-primary/10 text-primary',
    },
    {
      label: t('Upcoming Events', 'आगामी कार्यक्रम'),
      value: counts.events,
      icon: Calendar,
      color: 'bg-secondary/10 text-secondary',
    },
    {
      label: t('Active Jobs', 'सक्रिय नौकरियां'),
      value: counts.jobs,
      icon: Briefcase,
      color: 'bg-accent/10 text-accent',
    },
    {
      label: t('Messages', 'संदेश'),
      value: 0,
      icon: MessageSquare,
      color: 'bg-muted text-muted-foreground',
    },
  ];

  const quickLinks = [
    { icon: Users, label: t('View Directory', 'निर्देशिका देखें'), path: '/alumni/directory', color: 'text-primary' },
    { icon: Settings, label: t('Edit Profile', 'प्रोफ़ाइल संपादित करें'), path: '/alumni/profile', color: 'text-muted-foreground' },
    { icon: Calendar, label: t('Events', 'कार्यक्रम'), path: '/alumni/events', color: 'text-secondary' },
    { icon: Briefcase, label: t('Jobs Board', 'नौकरी बोर्ड'), path: '/alumni/jobs', color: 'text-accent' },
    { icon: MessageSquare, label: t('Messages', 'संदेश'), path: '#', color: 'text-muted-foreground' },
    { icon: Heart, label: t('Donate', 'दान करें'), path: '/donations', color: 'text-destructive' },
  ];

  if (!session) {
    return null; // Will redirect in useEffect
  }

  return (
    <PublicLayout>
      <main className="flex-1 py-16 bg-muted/20">
        <div className="container mx-auto px-4">
          {/* Welcome Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-2">
                {t('Welcome Back!', 'वापसी पर स्वागत है!')}
              </h1>
              <p className="text-muted-foreground">
                {t('You are logged in as', 'आप इस रूप में लॉग इन हैं')}: <span className="font-medium text-foreground">{session.email}</span>
              </p>
            </div>
            <Button variant="outline" onClick={handleLogout} className="mt-4 md:mt-0">
              <LogOut className="h-4 w-4 mr-2" />
              {t('Logout', 'लॉग आउट')}
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, index) => (
              <Card key={index} className="border-border/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg ${stat.color} flex items-center justify-center`}>
                      <stat.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Links */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="font-heading">{t('Quick Actions', 'त्वरित कार्रवाई')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {quickLinks.map((link, index) => (
                  <Link
                    key={index}
                    href={link.path}
                    className="flex flex-col items-center p-4 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    <link.icon className={`h-8 w-8 mb-2 ${link.color}`} />
                    <span className="text-sm text-center">{link.label}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Upcoming Events */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg">{t('Upcoming Events', 'आगामी कार्यक्रम')}</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/alumni/events">{t('View All', 'सभी देखें')}</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {events
                  .slice(0, 3)
                  .map((event) => (
                    <div key={event.id} className="flex gap-4 p-3 rounded-lg bg-muted/30">
                      <div className="text-center min-w-[50px]">
                        <p className="text-lg font-bold text-primary">{new Date(event.date).getDate()}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.date).toLocaleDateString('en', { month: 'short' })}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium">{event.title}</p>
                        <p className="text-sm text-muted-foreground">{event.location}</p>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* Recent Jobs */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg">{t('Latest Jobs', 'नवीनतम नौकरियां')}</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/alumni/jobs">{t('View All', 'सभी देखें')}</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {jobs
                  .slice(0, 3)
                  .map((job) => (
                    <div key={job.id} className="p-3 rounded-lg bg-muted/30">
                      <p className="font-medium">{job.title}</p>
                      <p className="text-sm text-muted-foreground">{job.company} • {job.location}</p>
                      <p className="text-xs text-primary mt-1">
                        {t('Posted by', 'द्वारा पोस्ट किया गया')}: {job.postedBy.name}
                      </p>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
};

export default AlumniDashboard;
