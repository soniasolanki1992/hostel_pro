"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, User, Mail, Phone, Eye, EyeOff } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import PageHero from '@/components/public/PageHero';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Card, CardContent } from '@/components/shadcn/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shadcn/dialog';
import { Badge } from '@/components/shadcn/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import institutions from '@/data/institutions.json';

interface Alumni {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  institution: string;
  batch: string;
  department: string;
  hostelRoom: string;
  visibility: { email: string; phone: string };
}

const AlumniDirectory = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [selectedAlumni, setSelectedAlumni] = useState<Alumni | null>(null);
  const [approvedAlumni, setApprovedAlumni] = useState<Alumni[]>([]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const role = typeof window !== 'undefined' ? localStorage.getItem('userRole') : null;
    if (!token || role !== 'ALUMNI') return;
    setIsAuthenticated(true);
    (async () => {
      const res = await fetch('/api/alumni/directory', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok && data.success) setApprovedAlumni(data.data);
    })();
  }, []);

  const filteredAlumni = approvedAlumni.filter(alumni => {
    const matchesSearch = alumni.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alumni.batch.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesInstitution = institutionFilter === 'all' || alumni.institution === institutionFilter;
    const matchesBatch = batchFilter === 'all' || alumni.batch.includes(batchFilter);
    return matchesSearch && matchesInstitution && matchesBatch;
  });

  const uniqueBatches = [...new Set(approvedAlumni.map(a => a.batch).filter(Boolean))];
  const alumniInstitutions = institutions.filter((i: { id: string }) => i.id === 'boys-hostel' || i.id === 'girls-hostel');

  if (!isAuthenticated) {
    return (
      <PublicLayout>
        <main className="flex-1 flex items-center justify-center py-16">
          <Card className="max-w-md mx-4">
            <CardContent className="pt-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <EyeOff className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-heading font-bold mb-2">
                {t('Login Required', 'लॉगिन आवश्यक है')}
              </h2>
              <p className="text-muted-foreground mb-6">
                {t('Please login to access the alumni directory.', 'कृपया पूर्व छात्र निर्देशिका तक पहुंचने के लिए लॉगिन करें।')}
              </p>
              <Button onClick={() => router.push('/alumni/login')}>
                {t('Login Now', 'अभी लॉगिन करें')}
              </Button>
            </CardContent>
          </Card>
        </main>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <PageHero
        title={t('Alumni Directory', 'पूर्व छात्र निर्देशिका')}
        subtitle={t('Find and connect with fellow alumni', 'साथी पूर्व छात्रों को खोजें और जुड़ें')}
      />

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          {/* Filters */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('Search by name or batch...', 'नाम या बैच से खोजें...')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder={t('Institution', 'संस्था')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('All Institutions', 'सभी संस्थाएं')}</SelectItem>
                    {alumniInstitutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>{inst.shortName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={batchFilter} onValueChange={setBatchFilter}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder={t('Batch', 'बैच')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('All Batches', 'सभी बैच')}</SelectItem>
                    {uniqueBatches.map((batch) => (
                      <SelectItem key={batch} value={batch}>{batch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Results Count */}
          <p className="text-sm text-muted-foreground mb-4">
            {t('Showing', 'दिखा रहा है')} {filteredAlumni.length} {t('alumni', 'पूर्व छात्र')}
          </p>

          {/* Alumni Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAlumni.map((alumni) => (
              <Card key={alumni.id} className="border-border/50 hover:shadow-elegant transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-heading font-semibold text-lg truncate">{alumni.name}</h3>
                      <p className="text-sm text-muted-foreground">{alumni.batch}</p>
                      <Badge variant="secondary" className="mt-2">
                        {institutions.find(i => i.id === alumni.institution)?.shortName}
                      </Badge>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => setSelectedAlumni(alumni)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {t('View Profile', 'प्रोफ़ाइल देखें')}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredAlumni.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">{t('No alumni found matching your criteria.', 'आपके मानदंडों से मेल खाने वाला कोई पूर्व छात्र नहीं मिला।')}</p>
            </div>
          )}
        </div>
      </section>

      {/* Profile Modal */}
      <Dialog open={!!selectedAlumni} onOpenChange={() => setSelectedAlumni(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{t('Alumni Profile', 'पूर्व छात्र प्रोफ़ाइल')}</DialogTitle>
          </DialogHeader>

          {selectedAlumni && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-heading font-bold">{selectedAlumni.name}</h3>
                  <p className="text-muted-foreground">{selectedAlumni.batch}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Badge>{institutions.find(i => i.id === selectedAlumni.institution)?.shortName}</Badge>
                  <span className="text-sm">{selectedAlumni.department}</span>
                </div>

                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">{t('Hostel Room', 'छात्रावास कमरा')}</p>
                  <p className="font-medium">{selectedAlumni.hostelRoom}</p>
                </div>

                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {selectedAlumni.visibility.email === 'alumni-only' ? (
                      <span className="text-sm">{selectedAlumni.email}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">{t('Hidden', 'छुपा हुआ')}</span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground italic">{t('Hidden by user', 'उपयोगकर्ता द्वारा छुपाया गया')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
};

export default AlumniDirectory;
