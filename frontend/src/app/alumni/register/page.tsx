"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Upload, User, GraduationCap, FileText, Users, Shield } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import PageHero from '@/components/public/PageHero';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Checkbox } from '@/components/shadcn/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

interface Reference {
  name: string;
  batch: string;
  email: string;
  phone: string;
  relationship: string;
  consent: boolean;
}

const AlumniRegister = () => {
  const { t } = useLanguage();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    popularName: '',
    email: '',
    institution: '',
    yearOfJoining: '',
    yearOfPassing: '',
    // Hometown
    hometownCity: '',
    hometownState: '',
    // Current location
    currentCity: '',
    currentState: '',
    currentCountry: '',
    // Professional
    currentDesignation: '',
    currentOrganisation: '',
    profession: '',
    // Education
    highestQualification: '',
    highestQualificationYear: '',
    graduation: '',
    graduationYear: '',
    // Social
    linkedinUrl: '',
    instagramUrl: '',
    // Hostel details
    department: '',
    rollNumber: '',
    hostelName: '',
    roomNumber: '',
    yearsOfStayFrom: '',
    yearsOfStayTo: '',
    profilePhoto: null as File | null,
    proofDocument: null as File | null,
    privacyConsent: false,
  });

  const [references, setReferences] = useState<Reference[]>([
    { name: '', batch: '', email: '', phone: '', relationship: '', consent: false }
  ]);

  const steps = [
    { number: 1, title: t('Personal Info', 'व्यक्तिगत जानकारी'), icon: User },
    { number: 2, title: t('Professional', 'व्यावसायिक'), icon: GraduationCap },
    { number: 3, title: t('Hostel Details', 'छात्रावास विवरण'), icon: FileText },
    { number: 4, title: t('Documents', 'दस्तावेज़'), icon: Upload },
    { number: 5, title: t('References', 'संदर्भ'), icon: Users },
    { number: 6, title: t('Privacy', 'गोपनीयता'), icon: Shield },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 50 }, (_, i) => currentYear - i);

  const updateFormData = (field: string, value: string | boolean | File | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addReference = () => {
    setReferences(prev => [...prev, { name: '', batch: '', email: '', phone: '', relationship: '', consent: false }]);
  };

  const updateReference = (index: number, field: keyof Reference, value: string | boolean) => {
    setReferences(prev => prev.map((ref, i) => i === index ? { ...ref, [field]: value } : ref));
  };

  const removeReference = (index: number) => {
    if (references.length > 1) {
      setReferences(prev => prev.filter((_, i) => i !== index));
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.firstName && formData.lastName && formData.email && formData.institution && formData.yearOfJoining && formData.yearOfPassing;
      case 2:
        return true; // Professional info optional
      case 3:
        return true; // Hostel details optional
      case 4:
        return true; // Documents optional for prototype
      case 5: {
        // At least one reference is mandatory, with consent ticked.
        const filledReferences = references.filter(ref => ref.name.trim() !== '');
        return filledReferences.length >= 1 && filledReferences.every(ref => ref.consent);
      }
      case 6:
        return formData.privacyConsent;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < 6) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  // S-12: fetch a registration intent token bound to the email before
  // any upload or final register call. The token must match the email
  // that the user actually submits.
  const fetchIntentToken = async (email: string): Promise<string> => {
    const res = await fetch('/api/alumni/register/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.data?.intentToken) {
      throw new Error(data.error || 'Could not start registration');
    }
    return data.data.intentToken as string;
  };

  const uploadOne = async (
    file: File,
    kind: 'profilePhoto' | 'proofDocument',
    intentToken: string,
  ) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    fd.append('intentToken', intentToken);
    const res = await fetch('/api/alumni/documents/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');
    return data.data.path as string;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const intentToken = await fetchIntentToken(formData.email);

      let profilePhotoPath: string | null = null;
      let proofDocumentPath: string | null = null;
      if (formData.profilePhoto) profilePhotoPath = await uploadOne(formData.profilePhoto, 'profilePhoto', intentToken);
      if (formData.proofDocument) proofDocumentPath = await uploadOne(formData.proofDocument, 'proofDocument', intentToken);

      const filledReferences = references.filter(ref => ref.name.trim() !== '');

      const res = await fetch('/api/alumni/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          profilePhoto: undefined,
          proofDocument: undefined,
          profilePhotoPath,
          proofDocumentPath,
          references: filledReferences,
          intentToken,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || t('Failed to submit registration', 'पंजीकरण जमा करने में विफल'));
        return;
      }
      toast.success(t('Your application is under review. You will gain access once approved by the administrator.', 'आपका आवेदन समीक्षाधीन है।'));
      router.push('/alumni/pending');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Network error', 'नेटवर्क त्रुटि'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <PageHero
        title={t('Join the Alumni Network', 'पूर्व छात्र नेटवर्क से जुड़ें')}
        subtitle={t('Complete your registration to connect with fellow alumni', 'साथी पूर्व छात्रों से जुड़ने के लिए अपना पंजीकरण पूरा करें')}
      />

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex justify-between items-center">
              {steps.map((s, index) => (
                <div key={s.number} className="flex flex-col items-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${
                    step > s.number ? 'bg-primary text-primary-foreground' :
                    step === s.number ? 'bg-primary text-primary-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {step > s.number ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
                  </div>
                  <span className={`text-xs text-center hidden sm:block ${step >= s.number ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {s.title}
                  </span>
                  {index < steps.length - 1 && (
                    <div className={`hidden sm:block absolute h-0.5 w-full top-5 left-1/2 -z-10 ${
                      step > s.number ? 'bg-primary' : 'bg-muted'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading">
                {t(`Step ${step}: `, `चरण ${step}: `)}{steps[step - 1].title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1: Personal Info */}
              {step === 1 && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">{t('First Name', 'पहला नाम')} *</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => updateFormData('firstName', e.target.value)}
                        placeholder={t('First name', 'पहला नाम')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="middleName">{t('Middle Name', 'मध्य नाम')}</Label>
                      <Input
                        id="middleName"
                        value={formData.middleName}
                        onChange={(e) => updateFormData('middleName', e.target.value)}
                        placeholder={t('Middle name (optional)', 'मध्य नाम (वैकल्पिक)')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">{t('Last Name', 'उपनाम')} *</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => updateFormData('lastName', e.target.value)}
                        placeholder={t('Last name', 'उपनाम')}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="popularName">{t('Popular Name / Nickname', 'लोकप्रिय नाम / उपनाम')}</Label>
                    <Input
                      id="popularName"
                      value={formData.popularName}
                      onChange={(e) => updateFormData('popularName', e.target.value)}
                      placeholder={t('I was popularly known by this name in the hostel', 'मुझे छात्रावास में इस नाम से जाना जाता था')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">{t('Email', 'ईमेल')} *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateFormData('email', e.target.value)}
                      placeholder={t('Enter your email', 'अपना ईमेल दर्ज करें')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="institution">{t('Institution', 'संस्था')} *</Label>
                    <Select value={formData.institution} onValueChange={(value) => updateFormData('institution', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select institution', 'संस्था चुनें')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="boys-hostel">{t("Sheth HG Jain Boys' Hostel", "सेठ एचजी जैन बालक छात्रावास")}</SelectItem>
                        <SelectItem value="girls-hostel">{t("RR Shravika Ashram (Girls' Hostel)", "आर.आर. श्राविका आश्रम (बालिका छात्रावास)")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="yearOfJoining">{t('Year of Joining', 'प्रवेश वर्ष')} *</Label>
                      <Select value={formData.yearOfJoining} onValueChange={(value) => updateFormData('yearOfJoining', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('Select year', 'वर्ष चुनें')} />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((year) => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="yearOfPassing">{t('Year of Passing', 'उत्तीर्ण वर्ष')} *</Label>
                      <Select value={formData.yearOfPassing} onValueChange={(value) => updateFormData('yearOfPassing', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('Select year', 'वर्ष चुनें')} />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((year) => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-4">{t('Hometown (Where you belong to)', 'गृहनगर (आप कहां के हैं)')}</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="hometownCity">{t('City', 'शहर')}</Label>
                        <Input
                          id="hometownCity"
                          value={formData.hometownCity}
                          onChange={(e) => updateFormData('hometownCity', e.target.value)}
                          placeholder={t('e.g., Jaipur', 'जैसे, जयपुर')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hometownState">{t('State', 'राज्य')}</Label>
                        <Input
                          id="hometownState"
                          value={formData.hometownState}
                          onChange={(e) => updateFormData('hometownState', e.target.value)}
                          placeholder={t('e.g., Rajasthan', 'जैसे, राजस्थान')}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Step 2: Professional Info */}
              {step === 2 && (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('This helps build your profile and connect with peers.', 'यह आपकी प्रोफ़ाइल बनाने और साथियों से जुड़ने में मदद करता है।')}
                  </p>

                  <div className="space-y-4">
                    <p className="text-sm font-medium">{t('Current Location', 'वर्तमान स्थान')}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentCity">{t('City', 'शहर')}</Label>
                        <Input
                          id="currentCity"
                          value={formData.currentCity}
                          onChange={(e) => updateFormData('currentCity', e.target.value)}
                          placeholder={t('e.g., Mumbai', 'जैसे, मुंबई')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="currentState">{t('State', 'राज्य')}</Label>
                        <Input
                          id="currentState"
                          value={formData.currentState}
                          onChange={(e) => updateFormData('currentState', e.target.value)}
                          placeholder={t('e.g., Maharashtra', 'जैसे, महाराष्ट्र')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="currentCountry">{t('Country', 'देश')}</Label>
                        <Input
                          id="currentCountry"
                          value={formData.currentCountry}
                          onChange={(e) => updateFormData('currentCountry', e.target.value)}
                          placeholder={t('e.g., India', 'जैसे, भारत')}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentDesignation">{t('Current Designation', 'वर्तमान पद')}</Label>
                      <Input
                        id="currentDesignation"
                        value={formData.currentDesignation}
                        onChange={(e) => updateFormData('currentDesignation', e.target.value)}
                        placeholder={t('e.g., Manager, Director', 'जैसे, प्रबंधक, निदेशक')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currentOrganisation">{t('Current Organisation', 'वर्तमान संगठन')}</Label>
                      <Input
                        id="currentOrganisation"
                        value={formData.currentOrganisation}
                        onChange={(e) => updateFormData('currentOrganisation', e.target.value)}
                        placeholder={t('Company/Organisation name', 'कंपनी/संगठन का नाम')}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profession">{t('Profession', 'पेशा')}</Label>
                    <Select value={formData.profession} onValueChange={(value) => updateFormData('profession', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select profession type', 'पेशा प्रकार चुनें')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="service">{t('Service', 'सेवा')}</SelectItem>
                        <SelectItem value="business">{t('Business', 'व्यापार')}</SelectItem>
                        <SelectItem value="practice">{t('Practice (CA/Doctor/Lawyer etc.)', 'प्रैक्टिस (सीए/डॉक्टर/वकील आदि)')}</SelectItem>
                        <SelectItem value="student">{t('Student', 'छात्र')}</SelectItem>
                        <SelectItem value="retired">{t('Retired', 'सेवानिवृत्त')}</SelectItem>
                        <SelectItem value="homemaker">{t('Homemaker', 'गृहिणी')}</SelectItem>
                        <SelectItem value="other">{t('Other', 'अन्य')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-4">{t('Education', 'शिक्षा')}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="graduation">{t('Graduation', 'स्नातक')}</Label>
                        <Input
                          id="graduation"
                          value={formData.graduation}
                          onChange={(e) => updateFormData('graduation', e.target.value)}
                          placeholder={t('e.g., B.Com, B.Tech', 'जैसे, बी.कॉम, बी.टेक')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="graduationYear">{t('Year', 'वर्ष')}</Label>
                        <Select value={formData.graduationYear} onValueChange={(value) => updateFormData('graduationYear', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('Select year', 'वर्ष चुनें')} />
                          </SelectTrigger>
                          <SelectContent>
                            {years.map((year) => (
                              <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="highestQualification">{t('Highest Qualification', 'उच्चतम योग्यता')}</Label>
                        <Input
                          id="highestQualification"
                          value={formData.highestQualification}
                          onChange={(e) => updateFormData('highestQualification', e.target.value)}
                          placeholder={t('e.g., MBA, PhD', 'जैसे, एमबीए, पीएचडी')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="highestQualificationYear">{t('Year', 'वर्ष')}</Label>
                        <Select value={formData.highestQualificationYear} onValueChange={(value) => updateFormData('highestQualificationYear', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('Select year', 'वर्ष चुनें')} />
                          </SelectTrigger>
                          <SelectContent>
                            {years.map((year) => (
                              <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-4">{t('Social Links (Optional)', 'सोशल लिंक्स (वैकल्पिक)')}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="linkedinUrl">{t('LinkedIn URL', 'लिंक्डइन URL')}</Label>
                        <Input
                          id="linkedinUrl"
                          value={formData.linkedinUrl}
                          onChange={(e) => updateFormData('linkedinUrl', e.target.value)}
                          placeholder="https://linkedin.com/in/yourprofile"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="instagramUrl">{t('Instagram URL', 'इंस्टाग्राम URL')}</Label>
                        <Input
                          id="instagramUrl"
                          value={formData.instagramUrl}
                          onChange={(e) => updateFormData('instagramUrl', e.target.value)}
                          placeholder="https://instagram.com/yourprofile"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Step 3: Hostel Details */}
              {step === 3 && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t('This information is optional but helps verify your identity.', 'यह जानकारी वैकल्पिक है लेकिन आपकी पहचान सत्यापित करने में मदद करती है।')}
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="department">{t('Department / Class', 'विभाग / कक्षा')}</Label>
                      <Input
                        id="department"
                        value={formData.department}
                        onChange={(e) => updateFormData('department', e.target.value)}
                        placeholder={t('e.g., Commerce, Science', 'जैसे, वाणिज्य, विज्ञान')}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rollNumber">{t('Roll Number', 'रोल नंबर')}</Label>
                      <Input
                        id="rollNumber"
                        value={formData.rollNumber}
                        onChange={(e) => updateFormData('rollNumber', e.target.value)}
                        placeholder={t('Your roll number', 'आपका रोल नंबर')}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hostelName">{t('Hostel Block', 'छात्रावास ब्लॉक')}</Label>
                      <Input
                        id="hostelName"
                        value={formData.hostelName}
                        onChange={(e) => updateFormData('hostelName', e.target.value)}
                        placeholder={t('e.g., Block A', 'जैसे, ब्लॉक A')}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="roomNumber">{t('Room Number', 'कमरा नंबर')}</Label>
                      <Input
                        id="roomNumber"
                        value={formData.roomNumber}
                        onChange={(e) => updateFormData('roomNumber', e.target.value)}
                        placeholder={t('e.g., 204', 'जैसे, 204')}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="yearsOfStayFrom">{t('Years of Stay (From)', 'रहने के वर्ष (से)')}</Label>
                      <Select value={formData.yearsOfStayFrom} onValueChange={(value) => updateFormData('yearsOfStayFrom', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('From year', 'वर्ष से')} />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((year) => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="yearsOfStayTo">{t('Years of Stay (To)', 'रहने के वर्ष (तक)')}</Label>
                      <Select value={formData.yearsOfStayTo} onValueChange={(value) => updateFormData('yearsOfStayTo', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('To year', 'वर्ष तक')} />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((year) => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* Step 4: Uploads */}
              {step === 4 && (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('Upload documents to help verify your alumni status. These are optional but speed up approval.', 'अपनी पूर्व छात्र स्थिति सत्यापित करने में मदद के लिए दस्तावेज़ अपलोड करें।')}
                  </p>

                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="font-medium">{t('Profile Photo', 'प्रोफ़ाइल फ़ोटो')}</p>
                      <p className="text-sm text-muted-foreground mb-4">{t('A recent photo helps batchmates recognize you', 'एक हालिया फ़ोटो बैचमेट्स को आपको पहचानने में मदद करती है')}</p>
                      <Input
                        type="file"
                        accept="image/*"
                        className="max-w-xs mx-auto"
                        onChange={(e) => updateFormData('profilePhoto', e.target.files?.[0] || null)}
                      />
                      {formData.profilePhoto && (
                        <p className="text-sm text-primary mt-2">{formData.profilePhoto.name}</p>
                      )}
                    </div>

                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="font-medium">{t('Proof Document', 'प्रमाण दस्तावेज़')}</p>
                      <p className="text-sm text-muted-foreground mb-4">{t('ID card, certificate, or any document showing hostel stay', 'आईडी कार्ड, प्रमाणपत्र, या कोई दस्तावेज़')}</p>
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="max-w-xs mx-auto"
                        onChange={(e) => updateFormData('proofDocument', e.target.files?.[0] || null)}
                      />
                      {formData.proofDocument && (
                        <p className="text-sm text-primary mt-2">{formData.proofDocument.name}</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Step 5: References */}
              {step === 5 && (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('At least 1 reference from a batchmate is required and the consent checkbox must be ticked.', 'कम से कम 1 बैचमेट का संदर्भ आवश्यक है और सहमति चेकबॉक्स पर निशान लगाना होगा।')}
                  </p>

                  {references.map((ref, index) => (
                    <Card key={index} className="mb-4">
                      <CardContent className="pt-4 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{t('Reference', 'संदर्भ')} {index + 1}</span>
                          {references.length > 1 && (
                            <Button variant="ghost" size="sm" onClick={() => removeReference(index)}>
                              {t('Remove', 'हटाएं')}
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>{t('Name', 'नाम')}</Label>
                            <Input
                              value={ref.name}
                              onChange={(e) => updateReference(index, 'name', e.target.value)}
                              placeholder={t('Batchmate name', 'बैचमेट का नाम')}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t('Batch', 'बैच')}</Label>
                            <Input
                              value={ref.batch}
                              onChange={(e) => updateReference(index, 'batch', e.target.value)}
                              placeholder={t('e.g., 2010-2014', 'जैसे, 2010-2014')}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>{t('Email (Optional)', 'ईमेल (वैकल्पिक)')}</Label>
                            <Input
                              type="email"
                              value={ref.email}
                              onChange={(e) => updateReference(index, 'email', e.target.value)}
                              placeholder={t('Their email', 'उनका ईमेल')}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t('Phone (Optional)', 'फ़ोन (वैकल्पिक)')}</Label>
                            <Input
                              value={ref.phone}
                              onChange={(e) => updateReference(index, 'phone', e.target.value)}
                              placeholder={t('Their phone', 'उनका फ़ोन')}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>{t('Relationship', 'संबंध')}</Label>
                          <Input
                            value={ref.relationship}
                            onChange={(e) => updateReference(index, 'relationship', e.target.value)}
                            placeholder={t('e.g., Roommate, Batchmate', 'जैसे, रूममेट, बैचमेट')}
                          />
                        </div>

                        {ref.name && (
                          <div className="flex items-start space-x-2 bg-muted/50 p-4 rounded-lg">
                            <Checkbox
                              id={`consent-${index}`}
                              checked={ref.consent}
                              onCheckedChange={(checked) => updateReference(index, 'consent', !!checked)}
                            />
                            <Label htmlFor={`consent-${index}`} className="text-sm font-normal leading-relaxed">
                              {t('I confirm that I have obtained consent from this person to share their contact details for alumni verification.', 'मैं पुष्टि करता/करती हूं कि मैंने इस व्यक्ति से उनके संपर्क विवरण साझा करने की सहमति प्राप्त की है।')}
                            </Label>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  <Button variant="outline" onClick={addReference} className="w-full">
                    + {t('Add Another Reference', 'एक और संदर्भ जोड़ें')}
                  </Button>
                </>
              )}

              {/* Step 6: Privacy Consent */}
              {step === 6 && (
                <>
                  <div className="bg-muted/30 rounded-lg p-4 max-h-64 overflow-y-auto text-sm space-y-4">
                    <h4 className="font-semibold">{t('Privacy Notice', 'गोपनीयता सूचना')}</h4>
                    <p>
                      {t('By registering on this alumni platform, you agree to the following:', 'इस पूर्व छात्र प्लेटफ़ॉर्म पर पंजीकरण करके, आप निम्नलिखित से सहमत होते हैं:')}
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li>{t('Your information will only be visible to verified alumni of the trust institutions.', 'आपकी जानकारी केवल ट्रस्ट संस्थानों के सत्यापित पूर्व छात्रों को दिखाई देगी।')}</li>
                      <li>{t('Your contact details will be hidden by default and you control what is visible.', 'आपके संपर्क विवरण डिफ़ॉल्ट रूप से छिपे रहेंगे और आप नियंत्रित करते हैं कि क्या दिखाई दे।')}</li>
                      <li>{t('Your data will never be shared with third parties or made public.', 'आपका डेटा कभी भी तीसरे पक्षों के साथ साझा नहीं किया जाएगा।')}</li>
                      <li>{t('You can request deletion of your data at any time.', 'आप किसी भी समय अपने डेटा को हटाने का अनुरोध कर सकते हैं।')}</li>
                      <li>{t('The trust administrators may verify your details before granting access.', 'ट्रस्ट प्रशासक पहुंच प्रदान करने से पहले आपके विवरण सत्यापित कर सकते हैं।')}</li>
                    </ul>
                  </div>

                  <div className="flex items-start space-x-2 bg-primary/5 p-4 rounded-lg border border-primary/20">
                    <Checkbox
                      id="privacyConsent"
                      checked={formData.privacyConsent}
                      onCheckedChange={(checked) => updateFormData('privacyConsent', !!checked)}
                    />
                    <Label htmlFor="privacyConsent" className="font-medium">
                      {t('I have read and agree to the Privacy Notice', 'मैंने गोपनीयता सूचना पढ़ ली है और उससे सहमत हूं')} *
                    </Label>
                  </div>
                </>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={step === 1}
                >
                  {t('Back', 'वापस')}
                </Button>

                {step < 6 ? (
                  <Button onClick={handleNext} disabled={!canProceed()}>
                    {t('Next', 'आगे')}
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={!canProceed() || isSubmitting}>
                    {isSubmitting ? t('Submitting...', 'जमा कर रहा है...') : t('Submit Application', 'आवेदन जमा करें')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </PublicLayout>
  );
};

export default AlumniRegister;
