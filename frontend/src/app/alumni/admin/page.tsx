"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Users, Calendar, Briefcase, Bell, FileText, Check, X, Eye, Trash2, Clock, Lock } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import PageHero from '@/components/public/PageHero';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/shadcn/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { Badge } from '@/components/shadcn/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/shadcn/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import institutions from '@/data/institutions.json';

interface Application {
  id: string;
  name: string;
  email: string;
  institution: string;
  yearOfJoining: number;
  yearOfPassing: number;
  department: string;
  status: string;
  submittedAt: string;
}
interface AlumniRow { id: string; name: string; institution: string; batch: string; department: string }
interface EventRow { id: string; title: string; date: string; location: string; status: string }
interface JobRow { id: string; title: string; company: string; status: string; postedBy: { name: string; batch: string } }

const AlumniAdmin = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [pendingApplications, setPendingApplications] = useState<Application[]>([]);
  const [approvedAlumni, setApprovedAlumni] = useState<AlumniRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  const STAFF_ROLES = ['TRUSTEE', 'SUPERINTENDENT', 'ACCOUNTS'];

  const loadAdminData = async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    const [pendingRes, approvedRes, evRes, jbRes] = await Promise.all([
      fetch('/api/alumni/admin/applications?status=PENDING', { headers }),
      fetch('/api/alumni/admin/applications?status=APPROVED', { headers }),
      fetch('/api/alumni/events', { headers }),
      fetch('/api/alumni/jobs', { headers }),
    ]);
    const pending = await pendingRes.json();
    const approved = await approvedRes.json();
    const ev = await evRes.json();
    const jb = await jbRes.json();
    if (pending.success) setPendingApplications(pending.data);
    if (approved.success) {
      setApprovedAlumni(approved.data.map((a: Application) => ({
        id: a.id, name: a.name, institution: a.institution,
        batch: `${a.yearOfJoining}-${a.yearOfPassing}`, department: a.department,
      })));
    }
    if (ev.success) setEvents(ev.data);
    if (jb.success) setJobs(jb.data);
  };

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const role = typeof window !== 'undefined' ? localStorage.getItem('userRole') : null;
    if (!token || !role || !STAFF_ROLES.includes(role)) {
      setIsAdminAuthenticated(false);
      return;
    }
    setIsAdminAuthenticated(true);
    loadAdminData(token).catch(() => toast.error(t('Failed to load admin data', 'व्यवस्थापक डेटा लोड करने में विफल')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAction = (app: Application, type: 'approve' | 'reject') => {
    setSelectedApp(app);
    setActionType(type);
  };

  const confirmAction = async () => {
    if (!selectedApp || !actionType) return;
    const token = localStorage.getItem('authToken');
    try {
      const res = await fetch(`/api/alumni/admin/applications/${selectedApp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: actionType }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || t('Action failed', 'कार्रवाई विफल'));
        return;
      }
      toast.success(
        `${selectedApp.name}'s ${t('application has been', 'का आवेदन')} ${actionType === 'approve' ? t('approved', 'स्वीकृत किया गया') : t('rejected', 'अस्वीकृत किया गया')}.`
      );
      if (token) await loadAdminData(token);
    } finally {
      setSelectedApp(null);
      setActionType(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const stats = [
    { label: t('Pending Applications', 'लंबित आवेदन'), value: pendingApplications.length, icon: FileText, color: 'text-secondary' },
    { label: t('Total Alumni', 'कुल पूर्व छात्र'), value: approvedAlumni.length, icon: Users, color: 'text-primary' },
    { label: t('Active Events', 'सक्रिय कार्यक्रम'), value: events.filter(e => e.status === 'upcoming').length, icon: Calendar, color: 'text-accent' },
    { label: t('Job Postings', 'नौकरी पोस्टिंग'), value: jobs.filter(j => j.status === 'active').length, icon: Briefcase, color: 'text-primary' },
  ];

  const auditLog: { id: number; action: string; user: string; target: string; timestamp: string }[] = [];

  // Admin Login Screen — gate via staff JWT (Trustee / Superintendent / Accounts).
  if (!isAdminAuthenticated) {
    return (
      <PublicLayout>
        <PageHero
          title={t('Admin Login', 'व्यवस्थापक लॉगिन')}
          subtitle={t('Secure access for trust administrators', 'ट्रस्ट प्रशासकों के लिए सुरक्षित पहुंच')}
        />

        <section className="py-16 bg-background flex-1">
          <div className="container mx-auto px-4 max-w-md">
            <Card>
              <CardHeader className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Lock className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="font-heading">{t('Admin Authentication', 'व्यवस्थापक प्रमाणीकरण')}</CardTitle>
                <CardDescription>
                  {t('Sign in with your staff account (Trustee / Superintendent / Accounts) to access the alumni admin panel.', 'पूर्व छात्र व्यवस्थापक पैनल तक पहुंचने के लिए अपने स्टाफ खाते से साइन इन करें।')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => router.push('/login')} className="w-full">
                  {t('Go to Staff Login', 'स्टाफ लॉगिन पर जाएं')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <PageHero
        title={t('Admin Panel', 'व्यवस्थापक पैनल')}
        subtitle={t('Manage alumni applications, events, and platform settings', 'पूर्व छात्र आवेदन, कार्यक्रम और प्लेटफ़ॉर्म सेटिंग्स प्रबंधित करें')}
      />

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, index) => (
              <Card key={index} className="border-border/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                      <stat.icon className={`h-6 w-6 ${stat.color}`} />
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

          {/* Tabs */}
          <Tabs defaultValue="applications">
            <TabsList className="mb-6 flex-wrap">
              <TabsTrigger value="applications" className="gap-2">
                <FileText className="h-4 w-4" />
                {t('Applications', 'आवेदन')}
                {pendingApplications.length > 0 && (
                  <Badge variant="destructive" className="ml-1">{pendingApplications.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="alumni" className="gap-2">
                <Users className="h-4 w-4" />
                {t('Alumni List', 'पूर्व छात्र सूची')}
              </TabsTrigger>
              <TabsTrigger value="events" className="gap-2">
                <Calendar className="h-4 w-4" />
                {t('Events', 'कार्यक्रम')}
              </TabsTrigger>
              <TabsTrigger value="jobs" className="gap-2">
                <Briefcase className="h-4 w-4" />
                {t('Jobs', 'नौकरियां')}
              </TabsTrigger>
              <TabsTrigger value="announcements" className="gap-2">
                <Bell className="h-4 w-4" />
                {t('Announcements', 'घोषणाएं')}
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-2">
                <Shield className="h-4 w-4" />
                {t('Audit Log', 'ऑडिट लॉग')}
              </TabsTrigger>
            </TabsList>

            {/* Applications Tab */}
            <TabsContent value="applications">
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading">{t('Pending Applications', 'लंबित आवेदन')}</CardTitle>
                  <CardDescription>
                    {t('Review and approve or reject alumni registration requests', 'पूर्व छात्र पंजीकरण अनुरोधों की समीक्षा करें और स्वीकृत या अस्वीकृत करें')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingApplications.length > 0 ? (
                    <div className="space-y-4">
                      {pendingApplications.map((app) => (
                        <div key={app.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg border border-border/50 gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold">{app.name}</h4>
                              <Badge variant="outline">{app.status}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{app.email}</p>
                            <div className="flex flex-wrap gap-4 mt-2 text-sm">
                              <span>{institutions.find(i => i.id === app.institution)?.shortName}</span>
                              <span>{app.yearOfJoining}\u2013{app.yearOfPassing}</span>
                              <span>{app.department}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {t('Submitted', 'जमा किया')}: {formatDate(app.submittedAt)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              {t('View', 'देखें')}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleAction(app, 'approve')}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              {t('Approve', 'स्वीकृत')}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleAction(app, 'reject')}
                            >
                              <X className="h-4 w-4 mr-1" />
                              {t('Reject', 'अस्वीकृत')}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      {t('No pending applications', 'कोई लंबित आवेदन नहीं')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Alumni List Tab */}
            <TabsContent value="alumni">
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading">{t('Approved Alumni', 'स्वीकृत पूर्व छात्र')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {approvedAlumni.map((alumni) => (
                      <div key={alumni.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div>
                          <p className="font-medium">{alumni.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {institutions.find(i => i.id === alumni.institution)?.shortName} • {alumni.batch}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{alumni.department}</Badge>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Events Tab */}
            <TabsContent value="events">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="font-heading">{t('Events Management', 'कार्यक्रम प्रबंधन')}</CardTitle>
                    <CardDescription>{t('Create and manage alumni events', 'पूर्व छात्र कार्यक्रम बनाएं और प्रबंधित करें')}</CardDescription>
                  </div>
                  <Button disabled>
                    <Calendar className="h-4 w-4 mr-2" />
                    {t('Create Event', 'कार्यक्रम बनाएं')}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {events.map((event) => (
                      <div key={event.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div>
                          <p className="font-medium">{event.title}</p>
                          <p className="text-sm text-muted-foreground">{event.date} • {event.location}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={event.status === 'upcoming' ? 'default' : 'secondary'}>{event.status}</Badge>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Jobs Tab */}
            <TabsContent value="jobs">
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading">{t('Jobs Management', 'नौकरी प्रबंधन')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {jobs.map((job) => (
                      <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div>
                          <p className="font-medium">{job.title}</p>
                          <p className="text-sm text-muted-foreground">{job.company} • {t('Posted by', 'द्वारा पोस्ट')}: {job.postedBy.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>{job.status}</Badge>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Announcements Tab */}
            <TabsContent value="announcements">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="font-heading">{t('Announcements', 'घोषणाएं')}</CardTitle>
                    <CardDescription>{t('Send announcements to alumni', 'पूर्व छात्रों को घोषणाएं भेजें')}</CardDescription>
                  </div>
                  <Button disabled>
                    <Bell className="h-4 w-4 mr-2" />
                    {t('New Announcement', 'नई घोषणा')}
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="text-center text-muted-foreground py-8">
                    {t('No announcements yet', 'अभी तक कोई घोषणा नहीं')}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Audit Log Tab */}
            <TabsContent value="audit">
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading">{t('Audit Log', 'ऑडिट लॉग')}</CardTitle>
                  <CardDescription>{t('Track all administrative actions', 'सभी प्रशासनिक कार्यों को ट्रैक करें')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {auditLog.map((log) => (
                      <div key={log.id} className="flex items-start gap-4 p-3 rounded-lg bg-muted/30">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Clock className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{log.action}</p>
                          <p className="text-sm text-muted-foreground">
                            {t('Target', 'लक्ष्य')}: {log.target}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {log.user} • {formatDate(log.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Confirmation Dialog */}
      <Dialog open={!!selectedApp && !!actionType} onOpenChange={() => { setSelectedApp(null); setActionType(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve'
                ? t('Approve Application', 'आवेदन स्वीकृत करें')
                : t('Reject Application', 'आवेदन अस्वीकृत करें')}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve'
                ? t('This will grant the applicant access to the alumni directory and features.', 'इससे आवेदक को पूर्व छात्र निर्देशिका और सुविधाओं तक पहुंच मिलेगी।')
                : t('This will reject the application. The applicant will be notified.', 'इससे आवेदन अस्वीकृत हो जाएगा। आवेदक को सूचित किया जाएगा।')}
            </DialogDescription>
          </DialogHeader>
          {selectedApp && (
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="font-medium">{selectedApp.name}</p>
              <p className="text-sm text-muted-foreground">{selectedApp.email}</p>
              <p className="text-sm text-muted-foreground">
                {institutions.find(i => i.id === selectedApp.institution)?.shortName} • {selectedApp.yearOfJoining}\u2013{selectedApp.yearOfPassing}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedApp(null); setActionType(null); }}>
              {t('Cancel', 'रद्द करें')}
            </Button>
            <Button
              onClick={confirmAction}
              variant={actionType === 'reject' ? 'destructive' : 'default'}
              className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {actionType === 'approve' ? t('Approve', 'स्वीकृत करें') : t('Reject', 'अस्वीकृत करें')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
};

export default AlumniAdmin;
