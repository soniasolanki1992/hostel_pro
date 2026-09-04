"use client";

import { useEffect, useState } from 'react';
import { Calendar, MapPin, Clock, Users } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import PageHero from '@/components/public/PageHero';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent } from '@/components/shadcn/card';
import { Badge } from '@/components/shadcn/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { useLanguage } from '@/contexts/LanguageContext';

interface EventItem {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  type: string;
  status: string;
}

const AlumniEvents = () => {
  const { t } = useLanguage();
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/alumni/events');
      const data = await res.json();
      if (res.ok && data.success) setEvents(data.data);
    })();
  }, []);

  const upcomingEvents = events.filter(e => e.status === 'upcoming');
  const pastEvents = events.filter(e => e.status === 'past');

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'reunion': return 'bg-primary/10 text-primary';
      case 'workshop': return 'bg-secondary/10 text-secondary';
      case 'celebration': return 'bg-accent/10 text-accent';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      day: date.getDate(),
      month: date.toLocaleDateString('en', { month: 'short' }),
      year: date.getFullYear(),
      full: date.toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    };
  };

  const EventCard = ({ event, isPast = false }: { event: EventItem; isPast?: boolean }) => {
    const date = formatDate(event.date);

    return (
      <Card className={`border-border/50 ${isPast ? 'opacity-70' : 'hover:shadow-elegant transition-shadow'}`}>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            {/* Date Badge */}
            <div className={`text-center min-w-[60px] p-3 rounded-lg ${isPast ? 'bg-muted' : 'bg-primary/10'}`}>
              <p className={`text-2xl font-bold ${isPast ? 'text-muted-foreground' : 'text-primary'}`}>{date.day}</p>
              <p className={`text-xs ${isPast ? 'text-muted-foreground' : 'text-primary'}`}>{date.month}</p>
              <p className="text-xs text-muted-foreground">{date.year}</p>
            </div>

            {/* Event Details */}
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-heading font-semibold text-lg">{event.title}</h3>
                <Badge className={getEventTypeColor(event.type)}>
                  {event.type.charAt(0).toUpperCase() + event.type.slice(1)}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground mb-3">{event.description}</p>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {event.time}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {event.location}
                </span>
              </div>

              {!isPast && (
                <Button className="mt-4" size="sm" disabled>
                  <Users className="h-4 w-4 mr-2" />
                  {t('RSVP (Coming Soon)', 'RSVP (जल्द आ रहा है)')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <PublicLayout>
      <PageHero
        title={t('Alumni Events', 'पूर्व छात्र कार्यक्रम')}
        subtitle={t('Stay connected through reunions, workshops, and celebrations', 'पुनर्मिलन, कार्यशालाओं और उत्सवों के माध्यम से जुड़े रहें')}
      />

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Create Event CTA */}
          <Card className="mb-8 bg-primary/5 border-primary/20">
            <CardContent className="pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-heading font-semibold mb-1">{t('Have an event idea?', 'कोई कार्यक्रम विचार है?')}</h3>
                <p className="text-sm text-muted-foreground">{t('Propose a reunion or workshop for fellow alumni.', 'साथी पूर्व छात्रों के लिए पुनर्मिलन या कार्यशाला का प्रस्ताव दें।')}</p>
              </div>
              <Button disabled>
                <Calendar className="h-4 w-4 mr-2" />
                {t('Create Event (Coming Soon)', 'कार्यक्रम बनाएं (जल्द आ रहा है)')}
              </Button>
            </CardContent>
          </Card>

          {/* Events Tabs */}
          <Tabs defaultValue="upcoming">
            <TabsList className="mb-6">
              <TabsTrigger value="upcoming">
                {t('Upcoming', 'आगामी')} ({upcomingEvents.length})
              </TabsTrigger>
              <TabsTrigger value="past">
                {t('Past Events', 'पिछले कार्यक्रम')} ({pastEvents.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-4">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))
              ) : (
                <Card className="border-dashed">
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    {t('No upcoming events scheduled.', 'कोई आगामी कार्यक्रम निर्धारित नहीं है।')}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="past" className="space-y-4">
              {pastEvents.length > 0 ? (
                pastEvents.map((event) => (
                  <EventCard key={event.id} event={event} isPast />
                ))
              ) : (
                <Card className="border-dashed">
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    {t('No past events to show.', 'दिखाने के लिए कोई पिछले कार्यक्रम नहीं हैं।')}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </PublicLayout>
  );
};

export default AlumniEvents;
