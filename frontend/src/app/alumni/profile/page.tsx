"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, GraduationCap, Home, Eye, EyeOff, Save } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import PageHero from '@/components/public/PageHero';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/shadcn/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import institutions from '@/data/institutions.json';

const AlumniProfile = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [profile, setProfile] = useState({
    name: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    institution: 'boys-hostel',
    batch: '',
    department: '',
    hostelBlock: '',
    roomNumber: '',
    yearsOfStay: '',
    bio: '',
    visibility: {
      email: 'alumni-only',
      phone: 'private',
      batch: 'alumni-only',
    } as Record<string, string>,
  });

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const role = typeof window !== 'undefined' ? localStorage.getItem('userRole') : null;
    if (!token || role !== 'ALUMNI') {
      router.push('/alumni/login');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/alumni/me', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok && data.success) {
          const d = data.data;
          setProfile({
            name: d.name || '',
            firstName: d.firstName || '',
            lastName: d.lastName || '',
            email: d.email || '',
            phone: d.phone || '',
            institution: d.institution || 'boys-hostel',
            batch: d.batch || '',
            department: d.department || '',
            hostelBlock: d.hostelBlock || '',
            roomNumber: d.roomNumber || '',
            yearsOfStay: d.yearsOfStay || '',
            bio: d.bio || '',
            visibility: { email: 'alumni-only', phone: 'private', batch: 'alumni-only', ...(d.visibility || {}) },
          });
          setIsAuthenticated(true);
        } else {
          toast.error(data.error || t('Failed to load profile', '\u092a\u094d\u0930\u094b\u092b\u093c\u093e\u0907\u0932 \u0932\u094b\u0921 \u0915\u0930\u0928\u0947 \u092e\u0947\u0902 \u0935\u093f\u092b\u0932'));
          router.push('/alumni/login');
        }
      } catch {
        router.push('/alumni/login');
      }
    })();
  }, [router, t]);

  const updateProfile = (field: string, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const updateVisibility = (field: string, value: string) => {
    setProfile(prev => ({
      ...prev,
      visibility: { ...prev.visibility, [field]: value },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const [firstName, ...rest] = profile.name.trim().split(' ');
      const lastName = rest.length ? rest.join(' ') : profile.lastName;
      const res = await fetch('/api/alumni/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: firstName || profile.firstName,
          lastName,
          phone: profile.phone,
          department: profile.department,
          hostelBlock: profile.hostelBlock,
          roomNumber: profile.roomNumber,
          visibility: profile.visibility,
          bio: profile.bio,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || t('Failed to save', 'सहेजने में विफल'));
        return;
      }
      toast.success(t('Your changes have been saved successfully.', 'आपके परिवर्तन सफलतापूर्वक सहेजे गए हैं।'));
    } catch {
      toast.error(t('Network error', 'नेटवर्क त्रुटि'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <PublicLayout>
      <PageHero
        title={t('My Profile', 'मेरी प्रोफ़ाइल')}
        subtitle={t('Manage your alumni profile and privacy settings', 'अपनी पूर्व छात्र प्रोफ़ाइल और गोपनीयता सेटिंग्स प्रबंधित करें')}
      />

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Profile Header */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-12 w-12 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-heading font-bold">{profile.name}</h2>
                  <p className="text-muted-foreground">{profile.batch}</p>
                  <p className="text-sm text-primary">
                    {institutions.find(i => i.id === profile.institution)?.name}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personal Information */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <User className="h-5 w-5" />
                {t('Personal Information', 'व्यक्तिगत जानकारी')}
              </CardTitle>
              <CardDescription>
                {t('Update your contact details', 'अपने संपर्क विवरण अपडेट करें')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('Full Name', 'पूरा नाम')}</Label>
                  <Input
                    id="name"
                    value={profile.name}
                    onChange={(e) => updateProfile('name', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('Email', 'ईमेल')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => updateProfile('email', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('Phone', 'फ़ोन')}</Label>
                  <Input
                    id="phone"
                    value={profile.phone}
                    onChange={(e) => updateProfile('phone', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('Bio', 'परिचय')}</Label>
                  <Input
                    value={profile.bio}
                    onChange={(e) => updateProfile('bio', e.target.value)}
                    placeholder={t('A short bio about yourself', 'अपने बारे में संक्षिप्त परिचय')}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Academic Information */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                {t('Academic Information', 'शैक्षणिक जानकारी')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('Institution', 'संस्था')}</Label>
                  <Input value={institutions.find(i => i.id === profile.institution)?.name} disabled />
                </div>
                <div className="space-y-2">
                  <Label>{t('Batch', 'बैच')}</Label>
                  <Input value={profile.batch} disabled />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department">{t('Department', 'विभाग')}</Label>
                  <Input
                    id="department"
                    value={profile.department}
                    onChange={(e) => updateProfile('department', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('Years of Stay', 'रहने के वर्ष')}</Label>
                  <Input value={profile.yearsOfStay} disabled />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hostel Information */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <Home className="h-5 w-5" />
                {t('Hostel Information', 'छात्रावास जानकारी')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hostelBlock">{t('Hostel Block', 'छात्रावास ब्लॉक')}</Label>
                  <Input
                    id="hostelBlock"
                    value={profile.hostelBlock}
                    onChange={(e) => updateProfile('hostelBlock', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roomNumber">{t('Room Number', 'कमरा नंबर')}</Label>
                  <Input
                    id="roomNumber"
                    value={profile.roomNumber}
                    onChange={(e) => updateProfile('roomNumber', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Privacy Settings */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <Eye className="h-5 w-5" />
                {t('Privacy Settings', 'गोपनीयता सेटिंग्स')}
              </CardTitle>
              <CardDescription>
                {t('Control who can see your information', 'नियंत्रित करें कि आपकी जानकारी कौन देख सकता है')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Email Visibility */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t('Email Address', 'ईमेल पता')}</p>
                    <p className="text-sm text-muted-foreground">{profile.email}</p>
                  </div>
                </div>
                <Select value={profile.visibility.email} onValueChange={(v) => updateVisibility('email', v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alumni-only">
                      <span className="flex items-center gap-2">
                        <Eye className="h-4 w-4" /> {t('Alumni Only', 'केवल पूर्व छात्र')}
                      </span>
                    </SelectItem>
                    <SelectItem value="private">
                      <span className="flex items-center gap-2">
                        <EyeOff className="h-4 w-4" /> {t('Private', 'निजी')}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Phone Visibility */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t('Phone Number', 'फ़ोन नंबर')}</p>
                    <p className="text-sm text-muted-foreground">{profile.phone}</p>
                  </div>
                </div>
                <Select value={profile.visibility.phone} onValueChange={(v) => updateVisibility('phone', v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alumni-only">
                      <span className="flex items-center gap-2">
                        <Eye className="h-4 w-4" /> {t('Alumni Only', 'केवल पूर्व छात्र')}
                      </span>
                    </SelectItem>
                    <SelectItem value="private">
                      <span className="flex items-center gap-2">
                        <EyeOff className="h-4 w-4" /> {t('Private', 'निजी')}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Batch Visibility */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <GraduationCap className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t('Batch & Academic Info', 'बैच और शैक्षणिक जानकारी')}</p>
                    <p className="text-sm text-muted-foreground">{profile.batch}, {profile.department}</p>
                  </div>
                </div>
                <Select value={profile.visibility.batch} onValueChange={(v) => updateVisibility('batch', v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alumni-only">
                      <span className="flex items-center gap-2">
                        <Eye className="h-4 w-4" /> {t('Alumni Only', 'केवल पूर्व छात्र')}
                      </span>
                    </SelectItem>
                    <SelectItem value="private">
                      <span className="flex items-center gap-2">
                        <EyeOff className="h-4 w-4" /> {t('Private', 'निजी')}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={isSaving} className="w-full" size="lg">
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? t('Saving...', 'सहेज रहा है...') : t('Save Changes', 'परिवर्तन सहेजें')}
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
};

export default AlumniProfile;
