"use client";

import { useEffect, useState } from 'react';
import { Briefcase, MapPin, Clock, User, Building, IndianRupee } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import PageHero from '@/components/public/PageHero';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent } from '@/components/shadcn/card';
import { Badge } from '@/components/shadcn/badge';
import { useLanguage } from '@/contexts/LanguageContext';

interface JobItem {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  salary: string;
  description: string;
  postedBy: { name: string; batch: string };
  postedAt: string;
  status: string;
}

const AlumniJobs = () => {
  const { t } = useLanguage();
  const [activeJobs, setActiveJobs] = useState<JobItem[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/alumni/jobs');
      const data = await res.json();
      if (res.ok && data.success) setActiveJobs(data.data);
    })();
  }, []);

  const getJobTypeColor = (type: string) => {
    switch (type) {
      case 'Full-time': return 'bg-primary/10 text-primary';
      case 'Internship': return 'bg-secondary/10 text-secondary';
      case 'Part-time': return 'bg-accent/10 text-accent';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('Today', 'आज');
    if (diffDays === 1) return t('Yesterday', 'कल');
    if (diffDays < 7) return `${diffDays} ${t('days ago', 'दिन पहले')}`;
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  };

  return (
    <PublicLayout>
      <PageHero
        title={t('Jobs Board', 'नौकरी बोर्ड')}
        subtitle={t('Opportunities shared by fellow alumni', 'साथी पूर्व छात्रों द्वारा साझा किए गए अवसर')}
      />

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Post Job CTA */}
          <Card className="mb-8 bg-secondary/5 border-secondary/20">
            <CardContent className="pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-heading font-semibold mb-1">{t('Hiring at your company?', 'आपकी कंपनी में भर्ती?')}</h3>
                <p className="text-sm text-muted-foreground">{t('Share job opportunities with the alumni network.', 'पूर्व छात्र नेटवर्क के साथ नौकरी के अवसर साझा करें।')}</p>
              </div>
              <Button variant="secondary" disabled>
                <Briefcase className="h-4 w-4 mr-2" />
                {t('Post a Job (Coming Soon)', 'नौकरी पोस्ट करें (जल्द आ रहा है)')}
              </Button>
            </CardContent>
          </Card>

          {/* Jobs Count */}
          <p className="text-sm text-muted-foreground mb-4">
            {t('Showing', 'दिखा रहा है')} {activeJobs.length} {t('active opportunities', 'सक्रिय अवसर')}
          </p>

          {/* Jobs List */}
          <div className="space-y-4">
            {activeJobs.map((job) => (
              <Card key={job.id} className="border-border/50 hover:shadow-elegant transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    {/* Company Icon */}
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Building className="h-6 w-6 text-muted-foreground" />
                    </div>

                    {/* Job Details */}
                    <div className="flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div>
                          <h3 className="font-heading font-semibold text-lg">{job.title}</h3>
                          <p className="text-primary font-medium">{job.company}</p>
                        </div>
                        <Badge className={getJobTypeColor(job.type)}>{job.type}</Badge>
                      </div>

                      <p className="text-sm text-muted-foreground mb-4">{job.description}</p>

                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {job.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <IndianRupee className="h-4 w-4" />
                          {job.salary}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatDate(job.postedAt)}
                        </span>
                      </div>

                      {/* Posted By */}
                      <div className="flex items-center justify-between pt-4 border-t border-border/50">
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">{t('Posted by', 'द्वारा पोस्ट किया गया')}:</span>
                          <span className="font-medium">{job.postedBy.name}</span>
                          <span className="text-muted-foreground">({job.postedBy.batch})</span>
                        </div>

                        <Button size="sm" disabled>
                          {t('Apply (Coming Soon)', 'आवेदन करें (जल्द आ रहा है)')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {activeJobs.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="pt-6 text-center text-muted-foreground">
                {t('No active job postings at the moment.', 'इस समय कोई सक्रिय नौकरी पोस्टिंग नहीं है।')}
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </PublicLayout>
  );
};

export default AlumniJobs;
