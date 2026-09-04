"use client";

import Link from 'next/link';
import { Users, Calendar, Briefcase, Heart, Shield, Lock, Eye, UserCheck } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import PageHero from '@/components/public/PageHero';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent } from '@/components/shadcn/card';
import { useLanguage } from '@/contexts/LanguageContext';
import institutions from '@/data/institutions.json';

const AlumniHome = () => {
  const { t } = useLanguage();

  const features = [
    {
      icon: Users,
      title: t('Reconnect with Batchmates', 'बैचमेट्स से जुड़ें'),
      description: t('Find and connect with your hostel friends from the same batch or era.', 'अपने बैच या युग के छात्रावास मित्रों को खोजें और जुड़ें।'),
    },
    {
      icon: Calendar,
      title: t('Events & Reunions', 'कार्यक्रम और पुनर्मिलन'),
      description: t('Stay updated on alumni gatherings, reunions, and special celebrations.', 'पूर्व छात्र समारोहों, पुनर्मिलनों और विशेष उत्सवों के बारे में अपडेट रहें।'),
    },
    {
      icon: Briefcase,
      title: t('Career & Job Sharing', 'करियर और नौकरी'),
      description: t('Discover job opportunities shared by fellow alumni or post openings from your organization.', 'साथी पूर्व छात्रों द्वारा साझा की गई नौकरी के अवसर खोजें।'),
    },
    {
      icon: Heart,
      title: t('Give Back', 'योगदान करें'),
      description: t('Support current residents and future generations through mentorship or donations.', 'मार्गदर्शन या दान के माध्यम से वर्तमान निवासियों का समर्थन करें।'),
    },
  ];

  const privacyFeatures = [
    {
      icon: UserCheck,
      title: t('Approval-Based Access', 'अनुमोदन-आधारित पहुंच'),
      description: t('Only verified alumni can access the directory.', 'केवल सत्यापित पूर्व छात्र ही निर्देशिका तक पहुंच सकते हैं।'),
    },
    {
      icon: Lock,
      title: t('Data Never Public', 'डेटा कभी सार्वजनिक नहीं'),
      description: t('Your information is never visible to the public.', 'आपकी जानकारी कभी भी सार्वजनिक रूप से दिखाई नहीं देती।'),
    },
    {
      icon: Eye,
      title: t('Alumni-Only Visibility', 'केवल पूर्व छात्र दृश्यता'),
      description: t('Choose what information fellow alumni can see.', 'चुनें कि साथी पूर्व छात्र कौन सी जानकारी देख सकते हैं।'),
    },
    {
      icon: Shield,
      title: t('Admin Moderated', 'व्यवस्थापक द्वारा संचालित'),
      description: t('All content is reviewed to maintain quality and safety.', 'गुणवत्ता और सुरक्षा बनाए रखने के लिए सभी सामग्री की समीक्षा की जाती है।'),
    },
  ];

  return (
    <PublicLayout>
      <PageHero
        title={t('Reconnect. Remember. Rise Together.', 'जुड़ें। याद करें। साथ आगे बढ़ें।')}
        subtitle={t('Official Alumni Network of Hirachand Gumanji Trust', 'हीराचंद गुमानजी ट्रस्ट का आधिकारिक पूर्व छात्र नेटवर्क')}
      >
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
          <Button asChild size="lg" className="text-lg px-8">
            <Link href="/alumni/register">{t('Register as Alumni', 'पूर्व छात्र के रूप में रजिस्टर करें')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-lg px-8 bg-background/10 border-background/30 hover:bg-background/20">
            <Link href="/alumni/login">{t('Login', 'लॉगिन')}</Link>
          </Button>
        </div>
      </PageHero>

      {/* Why Alumni Platform */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-center text-foreground mb-4">
            {t('Why Join the Alumni Network?', 'पूर्व छात्र नेटवर्क से क्यों जुड़ें?')}
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
            {t('This platform is built to reconnect people, not expose data.', 'यह प्लेटफॉर्म लोगों को जोड़ने के लिए बनाया गया है, डेटा उजागर करने के लिए नहीं।')}
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="border-border/50 hover:shadow-elegant transition-shadow">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-heading font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Institutions Covered */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-center text-foreground mb-4">
            {t('Institutions Covered', 'शामिल संस्थाएं')}
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
            {t('Connect with alumni from any of our institutions', 'हमारी किसी भी संस्था के पूर्व छात्रों से जुड़ें')}
          </p>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {institutions.filter((i: { id: string }) => i.id === 'boys-hostel' || i.id === 'girls-hostel').map((institution) => (
              <Card key={institution.id} className="border-border/50 hover:shadow-elegant transition-shadow">
                <CardContent className="pt-6 text-center">
                  <h3 className="font-heading font-semibold text-lg mb-2">{institution.shortName}</h3>
                  <p className="text-muted-foreground text-sm mb-1">{institution.location}</p>
                  <p className="text-xs text-muted-foreground">Est. {institution.established}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <Button asChild variant="outline">
              <Link href="/alumni/login">
                {t('View Alumni from Your Institution →', 'अपनी संस्था के पूर्व छात्र देखें →')}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Privacy & Trust */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-center text-foreground mb-4">
            {t('Your Privacy Matters', 'आपकी गोपनीयता महत्वपूर्ण है')}
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
            {t('We take data privacy seriously. Here\'s how we protect you.', 'हम डेटा गोपनीयता को गंभीरता से लेते हैं।')}
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {privacyFeatures.map((feature, index) => (
              <Card key={index} className="border-border/50 bg-muted/20">
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center mx-auto mb-4">
                    <feature.icon className="h-6 w-6 text-secondary" />
                  </div>
                  <h3 className="font-heading font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};

export default AlumniHome;
