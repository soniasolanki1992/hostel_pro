"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/shadcn/button';
import { ArrowRight, Heart, GraduationCap, Users } from 'lucide-react';
import { useState, useEffect } from 'react';

const images = [
  '/hostel-gate.png',
  '/hostel-building.png',
  '/hostel-room.png',
  '/hostel-temple.png',
  '/hostel-playground.jpg',
];

const Hero = () => {
  const { t } = useLanguage();
  const [currentImage, setCurrentImage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Background Images with Crossfade */}
      {images.map((image, index) => (
        <div
          key={index}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            index === currentImage ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Image
            src={image}
            alt={`Hostel view ${index + 1}`}
            fill
            sizes="100vw"
            className="object-cover"
            priority={index === 0}
          />
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/90 via-primary/80 to-primary/95" />

      {/* Decorative Elements */}
      <div className="absolute top-20 left-10 w-20 h-20 border border-accent/30 rounded-full animate-float" />
      <div className="absolute bottom-40 right-20 w-32 h-32 border border-accent/20 rounded-full animate-float" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/3 right-10 w-16 h-16 bg-accent/10 rounded-full animate-float" style={{ animationDelay: '2s' }} />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center text-primary-foreground">
          {/* Sanskrit Blessing */}
          <p className="text-accent font-medium mb-4 animate-fade-in">
            अहिंसा परमो धर्मः
          </p>

          {/* Main Title */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold mb-6 leading-tight animate-fade-in" style={{ animationDelay: '0.2s' }}>
            {t(
              'Seth Hirachand Gumanji Jain Trust',
              'सेठ हीराचंद गुमानजी जैन ट्रस्ट'
            )}
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-primary-foreground/90 mb-4 animate-fade-in" style={{ animationDelay: '0.4s' }}>
            {t('Mumbai', 'मुंबई')}
          </p>

          {/* Mission Statement */}
          <p className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mx-auto mb-8 leading-relaxed animate-fade-in" style={{ animationDelay: '0.6s' }}>
            {t(
              'Dedicated to Vidya Daan, spiritual welfare, and healthcare service to the Jain community since 1990',
              'विद्या दान, आध्यात्मिक कल्याण और स्वास्थ्य सेवा के साथ 1990 से जैन समुदाय की सेवा में समर्पित'
            )}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in" style={{ animationDelay: '0.8s' }}>
            <Link href="/apply">
              <Button size="lg" variant="accent" className="gap-2 min-w-[180px]">
                <GraduationCap className="h-5 w-5" />
                {t('Admissions', 'प्रवेश')}
              </Button>
            </Link>
            <Link href="/alumni">
              <Button size="lg" variant="secondary" className="gap-2 min-w-[180px]">
                <Users className="h-5 w-5" />
                {t('Alumni Portal', 'पूर्व छात्र पोर्टल')}
              </Button>
            </Link>
            <Link href="/donations">
              <Button size="lg" variant="secondary" className="gap-2 min-w-[180px]">
                <Heart className="h-5 w-5" />
                {t('Donate', 'दान करें')}
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto animate-fade-in" style={{ animationDelay: '1s' }}>
            {[
              { value: '80+', label: t('Years of Service', 'सेवा के वर्ष') },
              { value: '1000+', label: t('Students Supported', 'छात्रों को सहायता') },
              { value: '3', label: t('Institutions', 'संस्थाएं') },
              { value: '\u221E', label: t('Blessings', 'आशीर्वाद') },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-3xl md:text-4xl font-heading font-bold text-accent mb-1">
                  {stat.value}
                </p>
                <p className="text-sm text-primary-foreground/70">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Image Indicators */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        {images.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentImage(index)}
            className={`w-2 h-2 rounded-full transition-all ${
              index === currentImage ? 'bg-accent w-6' : 'bg-primary-foreground/40'
            }`}
          />
        ))}
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <ArrowRight className="h-6 w-6 text-primary-foreground/50 rotate-90" />
      </div>
    </section>
  );
};

export default Hero;
