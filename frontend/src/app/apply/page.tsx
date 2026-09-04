'use client';

import Link from "next/link";
import { ArrowRight, Shield, Users, Clock, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

type Vertical = 'boys-hostel' | 'girls-ashram' | 'dharamshala';

export default function ApplyPage() {
  const { t } = useLanguage();
  const [openMap, setOpenMap] = useState<Record<Vertical, boolean>>({
    'boys-hostel': true,
    'girls-ashram': true,
    'dharamshala': true,
  });

  useEffect(() => {
    fetch('/api/config/applications-status')
      .then((r) => r.json())
      .then((d) => { if (d?.success && d.data) setOpenMap(d.data); })
      .catch(() => { /* keep optimistic defaults */ });
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)" }}>
      {/* Header */}
      <header
        className="px-6 py-4 border-b"
        style={{
          backgroundColor: "var(--surface-primary)",
          borderColor: "var(--border-primary)",
        }}
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <img
                src="/logo.png"
                alt={t("Hirachand Gumanji Family Charitable Trust", "हीराचंद गुमानजी परिवार चैरिटेबल ट्रस्ट")}
                width={48}
                height={48}
                className="h-12 w-auto"
              />
            </Link>
            <div>
              <h1
                className="text-lg font-semibold"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}
              >
                {t("Hirachand Gumanji Family", "हीराचंद गुमानजी परिवार")}
              </h1>
              <p className="text-caption">{t("Charitable Trust", "चैरिटेबल ट्रस्ट")}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="nav-link">{t("Home", "होम")}</Link>
              <Link href="/apply" className="nav-link text-primary">{t("Apply Now", "अभी आवेदन करें")}</Link>
              <Link href="/track" className="nav-link">{t("Check Status", "स्थिति जांचें")}</Link>
              <Link href="/login" className="nav-link">{t("Login", "लॉगिन")}</Link>
            </nav>
            <LanguageToggle />
          </div>
        </div>
      </header>

      {/* Progress Header */}
      <section className="px-6 py-4" style={{ backgroundColor: "var(--surface-secondary)" }}>
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: "var(--bg-accent)" }}
                >
                  1
                </div>
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {t("Select Vertical", "प्रकार चुनें")}
                </span>
              </div>
              <div className="h-px w-16" style={{ backgroundColor: "var(--border-primary)" }}></div>
              <div className="flex items-center gap-2 opacity-50">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: "var(--color-gray-400)" }}
                >
                  2
                </div>
                <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  {t("Contact Details", "संपर्क विवरण")}
                </span>
              </div>
              <div className="h-px w-16" style={{ backgroundColor: "var(--border-primary)" }}></div>
              <div className="flex items-center gap-2 opacity-50">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: "var(--color-gray-400)" }}
                >
                  3
                </div>
                <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  {t("OTP Verification", "ओटीपी सत्यापन")}
                </span>
              </div>
              <div className="h-px w-16" style={{ backgroundColor: "var(--border-primary)" }}></div>
              <div className="flex items-center gap-2 opacity-50">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: "var(--color-gray-400)" }}
                >
                  4
                </div>
                <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  {t("Application Form", "आवेदन फॉर्म")}
                </span>
              </div>
            </div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <span>{t("Step 1 of 4", "चरण 1 / 4")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* DPDP Consent Banner */}
      <section className="px-6 py-6 bg-blue-50 border-b border-blue-200">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start gap-4">
            <Shield className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {t("Data Protection & Privacy", "डेटा सुरक्षा एवं गोपनीयता")}
              </h3>
              <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
                {t(
                  "Your personal information is protected under the Digital Personal Data Protection (DPDP) Act. By proceeding with your application, you consent to our data usage policies for admission processing.",
                  "आपकी व्यक्तिगत जानकारी डिजिटल व्यक्तिगत डेटा सुरक्षा (DPDP) अधिनियम के तहत सुरक्षित है। आवेदन आगे बढ़ाकर, आप प्रवेश प्रक्रिया के लिए हमारी डेटा उपयोग नीतियों से सहमत होते हैं।"
                )}
              </p>
              <Link
                href="/privacy-policy"
                className="text-blue-600 hover:text-blue-800 text-sm font-medium underline"
              >
                {t("Read our complete Privacy Policy →", "हमारी संपूर्ण गोपनीयता नीति पढ़ें →")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              {t("Choose Your Accommodation Type", "अपना आवास प्रकार चुनें")}
            </h2>
            <p className="text-lg mb-8" style={{ color: "var(--text-secondary)" }}>
              {t(
                "Select the hostel type you wish to apply for. Each option has specific requirements and facilities.",
                "वह छात्रावास प्रकार चुनें जिसके लिए आप आवेदन करना चाहते हैं। प्रत्येक विकल्प की विशिष्ट आवश्यकताएं और सुविधाएं हैं।"
              )}
            </p>
          </div>

          {/* Vertical Selection Cards */}
          <div className="grid gap-8 md:grid-cols-3 mb-12">
            {/* Boys Hostel Card */}
            <ApplyCardWrap href="/apply/boys-hostel/contact" open={openMap['boys-hostel']}>
              <div className={`card p-8 transition-all duration-200 border-2 h-full flex flex-col ${openMap['boys-hostel'] ? 'hover:shadow-lg cursor-pointer border-transparent hover:border-blue-500' : 'border-gray-200 opacity-60 cursor-not-allowed'}`}>
                <div className="text-center flex flex-col flex-1">
                  <div
                    className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "var(--color-blue-100)" }}
                  >
                    <Users className="w-10 h-10" style={{ color: "var(--color-blue-600)" }} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
                    {t("Boys Hostel", "बालक छात्रावास")}
                  </h3>
                  <p className="mb-6 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {t(
                      "Modern accommodation for male students with focus on academic excellence, character building, and spiritual growth in a safe, disciplined environment.",
                      "सुरक्षित, अनुशासित वातावरण में शैक्षिक उत्कृष्टता, चरित्र निर्माण और आध्यात्मिक विकास पर केंद्रित पुरुष छात्रों के लिए आधुनिक आवास।"
                    )}
                  </p>
                  <ul className="space-y-3 text-left mb-6">
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("2-3 person sharing rooms", "2-3 व्यक्ति साझा कमरे")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("Study hall & library access", "अध्ययन कक्ष और पुस्तकालय सुविधा")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("Sports & recreation facilities", "खेल और मनोरंजन सुविधाएं")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("24/7 security and warden supervision", "24/7 सुरक्षा और वार्डन निगरानी")}</span>
                    </li>
                  </ul>
                  <button className="btn-primary w-full mt-auto" disabled={!openMap['boys-hostel']}>
                    {openMap['boys-hostel']
                      ? <>{t("Apply to Boys Hostel", "बालक छात्रावास में आवेदन करें")}<ArrowRight className="w-4 h-4 ml-2" /></>
                      : <><Lock className="w-4 h-4 mr-2" />{t("Admissions Closed", "प्रवेश बंद")}</>}
                  </button>
                </div>
              </div>
            </ApplyCardWrap>

            {/* Girls Ashram Card */}
            <ApplyCardWrap href="/apply/girls-ashram/contact" open={openMap['girls-ashram']}>
              <div className={`card p-8 transition-all duration-200 border-2 h-full flex flex-col ${openMap['girls-ashram'] ? 'hover:shadow-lg cursor-pointer border-transparent hover:border-purple-500' : 'border-gray-200 opacity-60 cursor-not-allowed'}`}>
                <div className="text-center flex flex-col flex-1">
                  <div
                    className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "var(--color-purple-100)" }}
                  >
                    <Users className="w-10 h-10" style={{ color: "var(--color-purple-600)" }} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
                    {t("Girls Ashram", "बालिका आश्रम")}
                  </h3>
                  <p className="mb-6 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {t(
                      "Safe and nurturing environment for female students with enhanced security, dedicated study areas, and focus on holistic development.",
                      "उन्नत सुरक्षा, समर्पित अध्ययन क्षेत्र और समग्र विकास पर केंद्रित महिला छात्रों के लिए सुरक्षित और पोषणकारी वातावरण।"
                    )}
                  </p>
                  <ul className="space-y-3 text-left mb-6">
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("Enhanced security measures", "उन्नत सुरक्षा उपाय")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("Women's study & prayer areas", "महिला अध्ययन एवं प्रार्थना क्षेत्र")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("Cultural & spiritual activities", "सांस्कृतिक एवं आध्यात्मिक गतिविधियां")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("Matron & warden care", "मैट्रन एवं वार्डन देखभाल")}</span>
                    </li>
                  </ul>
                  <button className="btn-primary w-full mt-auto" disabled={!openMap['girls-ashram']}>
                    {openMap['girls-ashram']
                      ? <>{t("Apply to Girls Ashram", "बालिका आश्रम में आवेदन करें")}<ArrowRight className="w-4 h-4 ml-2" /></>
                      : <><Lock className="w-4 h-4 mr-2" />{t("Admissions Closed", "प्रवेश बंद")}</>}
                  </button>
                </div>
              </div>
            </ApplyCardWrap>

            {/* Dharamshala Card */}
            <ApplyCardWrap href="/apply/dharamshala/contact" open={openMap['dharamshala']}>
              <div className={`card p-8 transition-all duration-200 border-2 h-full flex flex-col ${openMap['dharamshala'] ? 'hover:shadow-lg cursor-pointer border-transparent hover:border-amber-500' : 'border-gray-200 opacity-60 cursor-not-allowed'}`}>
                <div className="text-center flex flex-col flex-1">
                  <div
                    className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "var(--color-amber-100)" }}
                  >
                    <Shield className="w-10 h-10" style={{ color: "var(--color-amber-600)" }} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
                    {t("Dharamshala", "धरमशाला")}
                  </h3>
                  <p className="mb-6 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {t(
                      "Spiritual retreat and temporary accommodation for pilgrims and visitors seeking peaceful stay with simple amenities and community facilities.",
                      "तीर्थयात्रियों और आगंतुकों के लिए सरल सुविधाओं और सामुदायिक सुविधाओं के साथ शांतिपूर्ण प्रवास के लिए आध्यात्मिक विश्राम और अस्थायी आवास।"
                    )}
                  </p>
                  <ul className="space-y-3 text-left mb-6">
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("Prayer & meditation halls", "प्रार्थना एवं ध्यान कक्ष")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("Simple, clean accommodation", "सरल, स्वच्छ आवास")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("Community kitchen facilities", "सामुदायिक रसोई सुविधाएं")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                      <span style={{ color: "var(--text-secondary)" }}>{t("Affordable short-term stay", "किफायती अल्पकालिक प्रवास")}</span>
                    </li>
                  </ul>
                  <button className="btn-primary w-full mt-auto" disabled={!openMap['dharamshala']}>
                    {openMap['dharamshala']
                      ? <>{t("Book Dharamshala", "धरमशाला बुक करें")}<ArrowRight className="w-4 h-4 ml-2" /></>
                      : <><Lock className="w-4 h-4 mr-2" />{t("Bookings Closed", "बुकिंग बंद")}</>}
                  </button>
                </div>
              </div>
            </ApplyCardWrap>
          </div>

          {/* Resume link for users who already started an application */}
          <div className="mb-12 text-center">
            <Link
              href="/apply/resume"
              className="inline-flex items-center gap-2 text-sm font-medium underline"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('Already started? Resume your application →', 'पहले से शुरू किया है? अपना आवेदन फिर से शुरू करें →')}
            </Link>
          </div>

          {/* Important Information */}
          <div className="card p-8 bg-blue-50 border border-blue-200">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Clock className="w-5 h-5 text-blue-600" />
              {t("Important Information", "महत्वपूर्ण जानकारी")}
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-blue-600 font-semibold">•</span>
                <div>
                  <h4 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                    {t("No Account Required Yet", "अभी खाता बनाने की आवश्यकता नहीं")}
                  </h4>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {t(
                      "You don't need to create an account to apply. An account will be created automatically only after final approval of your application.",
                      "आवेदन करने के लिए आपको खाता बनाने की आवश्यकता नहीं है। आपके आवेदन की अंतिम स्वीकृति के बाद ही स्वचालित रूप से खाता बनाया जाएगा।"
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-600 font-semibold">•</span>
                <div>
                  <h4 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                    {t("Track Your Application", "अपना आवेदन ट्रैक करें")}
                  </h4>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {t(
                      "After submission, you'll receive a tracking number via SMS/Email to monitor your application status throughout the admission process.",
                      "जमा करने के बाद, आपको प्रवेश प्रक्रिया के दौरान अपने आवेदन की स्थिति जानने के लिए SMS/ईमेल द्वारा एक ट्रैकिंग नंबर प्राप्त होगा।"
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-600 font-semibold">•</span>
                <div>
                  <h4 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                    {t("Document Preparation", "दस्तावेज तैयारी")}
                  </h4>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {t(
                      "Keep your documents ready: Birth Certificate, Educational Records, Community Recommendation, and Recent Photographs.",
                      "अपने दस्तावेज तैयार रखें: जन्म प्रमाण पत्र, शैक्षिक अभिलेख, सामुदायिक अनुशंसा, और हालिया तस्वीरें।"
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ApplyCardWrap({ href, open, children }: { href: string; open: boolean; children: React.ReactNode }) {
  if (open) {
    return <Link href={href} className="block h-full">{children}</Link>;
  }
  return (
    <div className="block h-full" aria-disabled="true" title="Admissions are currently closed">
      {children}
    </div>
  );
}
