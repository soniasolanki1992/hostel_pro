'use client';

import { Checkbox } from './Checkbox';
import { FileText, ScrollText, ListChecks } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const RULES_EN: string[] = [
  'Application for admission should be sent to the Secretary/Hostel Superintendent of the Institution on the prescribed form.',
  'During their stay, students shall observe the rules and regulations which have been framed or amended from time to time.',
  'The daily Roll Call will be held at 10:00 P.M. Every student must be present within 5 minutes of the call for attendance.',
  'No student shall go out of the institution after 10:00 P.M. without the written permission of the Superintendent.',
  'Students must follow the daily routine and attend daily Abhishek, Aarti, Assembly and Roll Call.',
  'Students will not cause any disturbance by reading or talking loudly in the library or any common area.',
  'No student will be allowed in any part of the hostel premises without a valid identity card. Outsiders are not allowed to stay/visit rooms or hostel premises.',
  'Property of the Institute, damaged by any student intentionally or unintentionally, shall be recovered from the student/parents/guardian immediately.',
  'Students are expected to respect all hostel staff. Any assistance/instructions given by the Security or any other staff must be observed and carried out immediately and without argument.',
  'Students must be punctual to all events and occasions including Annual Function, Sports Week, Daslakshan Parva, Suparshvanath Jayanti, Mahavir Jayanti, Religious Classes, 15th August, 26th January, seminars, camps, assemblies etc. Participation by every student is mandatory.',
  'No student will leave the boarding premises without prior written permission from the Superintendent, and the same must be given at the gate to security before leaving.',
  'Any student taking leave from the Institution without taking written permission of the Superintendent shall be liable to be fined and can be dismissed from the Institution.',
  'Students shall keep their own rooms clean. If at the time of inspection the room is not tidy/clean, the student will be fined.',
  'No gathering or meeting in groups shall be allowed in the institution without the previous sanction of the Superintendent.',
  'No student will be allowed to celebrate birthdays or any other personal occasion without prior written permission of the Superintendent.',
  'If any student is unwell, they will immediately inform the Superintendent and take medicine only with permission of a certified Doctor and inform their guardian immediately.',
  'Students should take full responsibility for their own belongings. The Institution will not be held responsible for any loss of personal belongings/money etc.',
  'When taking long leave with written permission, the room keys are to be left with the Security guard. No responsibility will be taken for personal belongings left behind.',
  'No student shall bring eatables forbidden by the Jain Religious Scriptures into hostel premises.',
  'The Superintendent shall have full powers to check the articles in the rooms of the student when necessary.',
  "Student's Father, Guardian and Recommender must meet the Superintendent whenever necessary.",
  'Students must switch off lights when not in the rooms or at the time of sleep, otherwise they will be fined.',
  'No student is allowed to keep any articles like MP-4, USB pen drive, guitar, Bluetooth speaker and camera or any such thing which may disturb the other students sharing their room.',
  'No student is allowed to keep any electrical gadgets like Electric Kettle, Heater, Iron etc.',
  'Students using filthy language, indiscipline, gross misconduct, violating instructions of the Superintendent, arrogant and disorderly behaviour, eloping from the Boarding House, beating or teasing co-students, continuous unauthorized absence and non-payment of dues will be expelled from the Hostel immediately.',
  'Smoking/consumption of alcohol/liquor/drugs/tobacco etc. in any form is strictly prohibited. Any student found under its influence will be rusticated from the Boarding immediately.',
  'As per the anti-ragging act, ragging has been made a strictly punishable offence. Any student found indulging in ragging will be prosecuted.',
  'Student will have to vacate the Institution within 4 days after the examination is over / re-admission is rejected.',
  'Only the Mess Committee will be allowed to interact with the mess staff. Suggestions/changes/reports must be given to the Superintendent and Mess Committee in writing. Silence must be observed during meals.',
  'No student is allowed to talk on Mobile phone after 11 P.M. in boarding premises. Strict action will be taken if found wandering in the premises.',
  'All students should maintain a decent dress code and during religious/national functions should dress appropriately.',
  'No student will participate in any kind of act which will disturb the boarding atmosphere and the society as a whole.',
  'No student should ever instigate other students into any sort of indiscipline or any act which will hamper other students physically or mentally.',
  'No student is allowed to keep playing cards in his possession or gamble. Any such act will be strictly punished.',
  'No student will possess any kind of sharp articles like knives, kirpan, swords etc.',
  'Though every care is taken, the Boarding Authority will not be held responsible for any accident or mishap that may occur to the student during the term.',
  'Students must believe in the sanctity of the temple.',
  'No student is allowed to take any newspapers or magazines from the Reading Room.',
  'Library books will be issued during fixed hours and must be returned to the Librarian within a fortnight from the date of issue as per library rules.',
  'No posters, notices or nails will be put up by the students in their rooms, and no posters or paper shall be pasted on window or door glass.',
  'No cultural programs will be held, organized or performed without permission.',
  'No student will ask for personal work from hostel staff.',
  'Students are strictly prohibited from giving any sort of tip to servants. A common box will be kept by the Superintendent and the money collected will be distributed on the annual day celebration.',
  'The student can be asked to leave the boarding in case of violation of these Rules and Regulations and the Security Deposit will be forfeited.',
];

const RULES_HI: string[] = [
  'प्रवेश के लिए आवेदन निर्धारित प्रपत्र पर संस्थान के सचिव/छात्रावास अधीक्षक को भेजा जाना चाहिए।',
  'अपने प्रवास के दौरान, छात्र समय-समय पर बनाए या संशोधित किए गए नियमों और विनियमों का पालन करेंगे।',
  'दैनिक रोल कॉल रात 10:00 बजे होगी। प्रत्येक छात्र को कॉल के 5 मिनट के भीतर उपस्थित होना अनिवार्य है।',
  'कोई भी छात्र अधीक्षक की लिखित अनुमति के बिना रात 10:00 बजे के बाद संस्थान से बाहर नहीं जाएगा।',
  'छात्रों को दैनिक दिनचर्या का पालन करना होगा और दैनिक अभिषेक, आरती, सभा और रोल कॉल में उपस्थित रहना होगा।',
  'छात्र पुस्तकालय या किसी भी सामान्य क्षेत्र में जोर से पढ़कर या बात करके कोई गड़बड़ी नहीं करेंगे।',
  'वैध पहचान पत्र के बिना किसी भी छात्र को छात्रावास परिसर के किसी भी हिस्से में जाने की अनुमति नहीं होगी। बाहरी लोगों को कमरों में रहने/जाने या छात्रावास परिसर में जाने की अनुमति नहीं है।',
  'किसी भी छात्र द्वारा जानबूझकर या अनजाने में संस्थान की संपत्ति को नुकसान पहुंचाए जाने पर तत्काल छात्र/माता-पिता/अभिभावक से वसूल किया जाएगा।',
  'छात्रों से अपेक्षा की जाती है कि वे सभी छात्रावास कर्मचारियों का सम्मान करें। सुरक्षा या किसी अन्य कर्मचारी द्वारा दी गई सहायता/निर्देशों का तुरंत और बिना तर्क के पालन किया जाएगा।',
  'छात्रों को सभी कार्यक्रमों और अवसरों में समय का पाबंद होना चाहिए। प्रत्येक छात्र की भागीदारी अनिवार्य है।',
  'अधीक्षक की पूर्व लिखित अनुमति के बिना कोई भी छात्र बोर्डिंग परिसर नहीं छोड़ेगा।',
  'अधीक्षक की लिखित अनुमति के बिना संस्थान से छुट्टी लेने वाले किसी भी छात्र पर जुर्माना लगाया जा सकता है और संस्थान से निष्कासित किया जा सकता है।',
  'छात्र अपने कमरों को साफ रखेंगे। निरीक्षण के समय यदि कमरा साफ-सुथरा नहीं है, तो छात्र पर जुर्माना लगाया जाएगा।',
  'अधीक्षक की पूर्व अनुमति के बिना संस्थान में समूहों में कोई सभा या बैठक की अनुमति नहीं होगी।',
  'अधीक्षक की पूर्व लिखित अनुमति के बिना किसी भी छात्र को जन्मदिन या किसी अन्य व्यक्तिगत अवसर का उत्सव मनाने की अनुमति नहीं होगी।',
  'यदि कोई छात्र अस्वस्थ है, तो वह तुरंत अधीक्षक को सूचित करेगा और केवल प्रमाणित डॉक्टर की अनुमति से ही दवा लेगा और अपने अभिभावक को तुरंत सूचित करेगा।',
  'छात्रों को अपनी संपत्ति की पूरी जिम्मेदारी लेनी चाहिए। व्यक्तिगत सामान/धन आदि के नुकसान के लिए संस्थान जिम्मेदार नहीं होगा।',
  'लंबी छुट्टी लेते समय कमरे की चाबियाँ सुरक्षा गार्ड के पास छोड़नी होंगी। पीछे छोड़े गए व्यक्तिगत सामान की कोई जिम्मेदारी नहीं ली जाएगी।',
  'कोई भी छात्र जैन धर्मशास्त्रों द्वारा निषिद्ध खाद्य पदार्थ छात्रावास परिसर में नहीं लाएगा।',
  'आवश्यकता पड़ने पर अधीक्षक के पास छात्रों के कमरों में सामान की जांच करने की पूरी शक्ति होगी।',
  'जब भी आवश्यक हो, छात्र के पिता, अभिभावक और अनुशंसाकर्ता को अधीक्षक से मिलना चाहिए।',
  'छात्रों को कमरे में नहीं होने पर या सोते समय लाइट बंद करनी चाहिए, अन्यथा उन पर जुर्माना लगाया जाएगा।',
  'किसी भी छात्र को MP-4, यूएसबी पेन ड्राइव, गिटार और कैमरा या ऐसी कोई भी वस्तु रखने की अनुमति नहीं है जो रूममेट्स को परेशान कर सकती है।',
  'किसी भी छात्र को इलेक्ट्रिक केतली, हीटर, इस्त्री आदि जैसे विद्युत उपकरण रखने की अनुमति नहीं है।',
  'गंदी भाषा, अनुशासनहीनता, घोर कदाचार, अधीक्षक के निर्देशों का उल्लंघन, अहंकारी और अव्यवस्थित व्यवहार, सहपाठियों को मारना या चिढ़ाना, लगातार अनधिकृत अनुपस्थिति और बकाया का भुगतान न करने वाले छात्रों को छात्रावास से तुरंत निष्कासित कर दिया जाएगा।',
  'किसी भी रूप में धूम्रपान/शराब/मादक पदार्थ/तंबाकू आदि का सेवन सख्त वर्जित है। प्रभाव में पाए जाने वाले किसी भी छात्र को बोर्डिंग से तुरंत निष्कासित कर दिया जाएगा।',
  'रैगिंग विरोधी अधिनियम के अनुसार, रैगिंग को सख्ती से दंडनीय अपराध बनाया गया है। रैगिंग में शामिल पाए गए किसी भी छात्र पर मुकदमा चलाया जाएगा।',
  'परीक्षा समाप्त होने / पुनः प्रवेश अस्वीकृत होने के 4 दिनों के भीतर छात्र को संस्थान खाली करना होगा।',
  'केवल मेस कमेटी को मेस स्टाफ के साथ बातचीत करने की अनुमति होगी। भोजन के दौरान मौन रहना चाहिए।',
  'किसी भी छात्र को बोर्डिंग परिसर में रात 11 बजे के बाद मोबाइल फोन पर बात करने की अनुमति नहीं है।',
  'सभी छात्रों को एक उचित ड्रेस कोड बनाए रखना चाहिए और धार्मिक/राष्ट्रीय कार्यक्रमों के दौरान उचित रूप से कपड़े पहनने चाहिए।',
  'कोई भी छात्र ऐसे किसी भी कार्य में भाग नहीं लेगा जो बोर्डिंग के माहौल और समाज को परेशान करेगा।',
  'कोई भी छात्र दूसरे छात्रों को किसी भी प्रकार की अनुशासनहीनता या दूसरों को शारीरिक या मानसिक रूप से नुकसान पहुंचाने वाले कार्य के लिए कभी भी प्रेरित नहीं करेगा।',
  'किसी भी छात्र को ताश के पत्ते रखने या जुआ खेलने की अनुमति नहीं है। ऐसे किसी भी कार्य को सख्ती से दंडित किया जाएगा।',
  'कोई भी छात्र चाकू, कृपाण, तलवार आदि जैसी कोई भी तेज वस्तु अपने पास नहीं रखेगा।',
  'हालांकि हर देखभाल की जाती है, बोर्डिंग प्राधिकरण कार्यकाल के दौरान छात्र के साथ होने वाली किसी भी दुर्घटना या मिशाप के लिए जिम्मेदार नहीं होगा।',
  'छात्रों को मंदिर की पवित्रता में विश्वास करना चाहिए।',
  'किसी भी छात्र को रीडिंग रूम से कोई भी समाचार पत्र या पत्रिका लेने की अनुमति नहीं है।',
  'पुस्तकालय की पुस्तकें निश्चित घंटों के दौरान जारी की जाएंगी और जारी होने की तारीख से पंद्रह दिनों के भीतर पुस्तकालय नियमों के अनुसार पुस्तकालयाध्यक्ष को वापस की जानी चाहिए।',
  'छात्रों द्वारा अपने कमरों में कोई पोस्टर, नोटिस या कीलें नहीं लगाई जाएंगी।',
  'अनुमति के बिना कोई भी सांस्कृतिक कार्यक्रम आयोजित नहीं किया जाएगा।',
  'कोई भी छात्र छात्रावास के कर्मचारियों से व्यक्तिगत काम नहीं मांगेगा।',
  'छात्रों को नौकरों को किसी भी प्रकार की टिप देना सख्त वर्जित है।',
  'इन नियमों और विनियमों के उल्लंघन की स्थिति में छात्र को बोर्डिंग छोड़ने के लिए कहा जा सकता है और सुरक्षा जमा जब्त कर ली जाएगी।',
];

const INSTRUCTIONS_EN: string[] = [
  'Applications which are not duly filled in or where information is withheld, wrongly given, or insufficiently given will be rejected.',
  'Boarding will remain closed for one month during May every year.',
  'Participation and attendance is mandatory in PATHSHALA (Religious Classes) for all students taking admission in the Boarding.',
  'Rules & Regulations, Discipline and Dignity of the PATHSHALA and BOARDING must be maintained by all the Boarding Students.',
  'Admission will be subject to an interview and compliance of all requirements. The student and the Local Guardian must compulsorily attend the interview.',
  'A student of Non-CA category who fails consecutively two times, and a CA-Category student who fails three times in their examinations, will not be given admission thereafter (CA Article ship is not to be completed).',
  '1st Term receipt should be produced at the time of claiming refund of deposit mentioned therein. In case of loss of this receipt, the deposit amount will not be refunded.',
  'The Caution money will be forfeited in case of any breach of the rules of the institution.',
  'In case of discontinuation, collect the caution money within six months.',
];

const INSTRUCTIONS_HI: string[] = [
  'जो आवेदन ठीक से नहीं भरे गए हैं या जहां जानकारी रोकी गई है, गलत दी गई है, या अपर्याप्त दी गई है, उन्हें अस्वीकार कर दिया जाएगा।',
  'बोर्डिंग हर साल मई के दौरान एक महीने के लिए बंद रहेगी।',
  'बोर्डिंग में प्रवेश लेने वाले सभी छात्रों के लिए पाठशाला (धार्मिक कक्षाएं) में भागीदारी और उपस्थिति अनिवार्य है।',
  'पाठशाला और बोर्डिंग के नियम, अनुशासन और गरिमा को सभी बोर्डिंग छात्रों द्वारा बनाए रखा जाना चाहिए।',
  'प्रवेश साक्षात्कार और सभी आवश्यकताओं के अनुपालन के अधीन होगा। साक्षात्कार के समय छात्र और स्थानीय अभिभावक का उपस्थित होना अनिवार्य है।',
  'गैर-सीए श्रेणी का एक छात्र जो लगातार दो बार और सीए-श्रेणी का छात्र जो अपनी परीक्षाओं में तीन बार असफल होता है, उसे इसके बाद प्रवेश नहीं दिया जाएगा।',
  'जमा की वापसी का दावा करते समय प्रथम टर्म की रसीद प्रस्तुत की जानी चाहिए। इस रसीद के खोने की स्थिति में जमा राशि वापस नहीं की जाएगी।',
  'संस्थान के नियमों का उल्लंघन होने पर सावधानी राशि (कॉशन मनी) जब्त कर ली जाएगी।',
  'पढ़ाई बीच में छोड़ने की स्थिति में, छह महीने के भीतर सावधानी राशि (कॉशन मनी) प्राप्त करें।',
];

const DOCS_REQUIRED_EN: string[] = [
  'Caste Certificate from native place (Digamber Jain Mandir) — Original',
  'Bonafide Certificate of College/Institute — Original',
  'Firm letter from Chartered Accountant for Articleship/Internship',
  'Medical Fitness Certificate — Original',
  'Birth Certificate — Attested copy',
  'Aadhar Card / Voter ID Card — Attested copy',
  'Ration Card / Electricity Bill / Water Bill — Attested copy',
  'Marksheets of last four examinations — Attested copy',
  'Fee Receipt of current academic year (or Registration letter from Institute for CA students 102-103)',
  '2 Passport size photographs',
  'Admission Form duly completed',
  'Local Guardian Aadhar Card',
];

const DOCS_REQUIRED_HI: string[] = [
  'मूल निवास से जाति प्रमाण पत्र (दिगंबर जैन मंदिर) — मूल',
  'कॉलेज/संस्थान का बोनाफाइड प्रमाण पत्र — मूल',
  'चिकित्सा फिटनेस प्रमाण पत्र — मूल (या आर्टिकलशिप/इंटर्नशिप के लिए चार्टर्ड अकाउंटेंट का पत्र)',
  'जन्म प्रमाण पत्र — प्रमाणित प्रति',
  'आधार कार्ड / मतदाता पहचान पत्र — प्रमाणित प्रति',
  'राशन कार्ड / बिजली बिल / पानी का बिल — प्रमाणित प्रति',
  'पिछली चार परीक्षाओं की मार्कशीट — प्रमाणित प्रति',
  'चालू शैक्षणिक वर्ष की शुल्क रसीद (या सीए छात्रों 102-103 के लिए संस्थान से पंजीकरण पत्र)',
  '2 पासपोर्ट साइज फोटो',
  'पूर्ण रूप से भरा हुआ प्रवेश फॉर्म',
  'स्थानीय अभिभावक का आधार कार्ड',
];

interface TermsAndConditionsProps {
  data: any;
  onChange: (field: string, value: any) => void;
  errors?: Record<string, string>;
  vertical?: 'boys-hostel' | 'girls-ashram' | 'dharamshala';
}

export function TermsAndConditions({ data, onChange, errors = {}, vertical = 'boys-hostel' }: TermsAndConditionsProps) {
  const { t, language } = useLanguage();

  const usingHi = language === 'hi';
  const rulesList = usingHi ? RULES_HI : RULES_EN;
  const instrList = usingHi ? INSTRUCTIONS_HI : INSTRUCTIONS_EN;
  const docsList = usingHi ? DOCS_REQUIRED_HI : DOCS_REQUIRED_EN;

  const placeEn = vertical === 'girls-ashram' ? 'Ashram' : vertical === 'dharamshala' ? 'Dharamshala' : 'Hostel';
  const placeHi = vertical === 'girls-ashram' ? 'आश्रम' : vertical === 'dharamshala' ? 'धर्मशाला' : 'छात्रावास';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-blue-100)' }}>
          <ScrollText className="w-6 h-6" style={{ color: 'var(--color-blue-600)' }} />
        </div>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('Rules, Instructions & Conditions', 'नियम, निर्देश और शर्तें')}
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            {t('Please read carefully and accept all conditions to proceed', 'कृपया सावधानी से पढ़ें और आगे बढ़ने के लिए सभी शर्तें स्वीकार करें')}
          </p>
        </div>
      </div>

      <div className="card p-6 border-2" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center gap-2 mb-4">
          <ListChecks className="w-5 h-5" style={{ color: 'var(--color-blue-600)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('Rules & Regulations', 'नियम और विनियम')}
          </h3>
        </div>
        <div className="max-h-96 overflow-y-auto pr-2">
          <ol className="list-decimal pl-5 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {rulesList.map((rule, idx) => (
              <li key={idx} className="leading-relaxed">{rule}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className="card p-6 border-2" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5" style={{ color: 'var(--color-blue-600)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('Important Instructions', 'महत्वपूर्ण निर्देश')}
          </h3>
        </div>
        <ul className="list-disc pl-5 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {instrList.map((instr, idx) => (
            <li key={idx} className="leading-relaxed">{instr}</li>
          ))}
        </ul>
      </div>

      <div className="card p-6 border-2" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5" style={{ color: 'var(--color-blue-600)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('Documents Required at Admission', 'प्रवेश के समय आवश्यक दस्तावेज़')}
          </h3>
        </div>
        <ul className="list-disc pl-5 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {docsList.map((doc, idx) => (
            <li key={idx} className="leading-relaxed">{doc}</li>
          ))}
        </ul>
      </div>

      <div className="card p-6 border-2" style={{ backgroundColor: 'var(--color-blue-50)', borderColor: 'var(--color-blue-200)' }}>
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          {t('Acceptance of Conditions', 'शर्तों की स्वीकृति')}
        </h3>
        <div className="space-y-3">
          <Checkbox
            checked={!!data.isDigamberJain}
            onChange={(e) => onChange('isDigamberJain', e.target.checked)}
            label={t('I confirm that I belong to the Digamber Jain community', 'मैं पुष्टि करता/करती हूं कि मैं दिगंबर जैन समुदाय से हूं')}
            error={errors.isDigamberJain}
            required
          />
          <Checkbox
            checked={!!data.vegOnlyDiet}
            onChange={(e) => onChange('vegOnlyDiet', e.target.checked)}
            label={t('I agree to follow a strictly vegetarian (Veg only) diet and will not bring eatables forbidden by Jain Religious Scriptures', 'मैं केवल शाकाहारी आहार का पालन करने और जैन धर्मशास्त्रों द्वारा निषिद्ध खाद्य पदार्थ न लाने के लिए सहमत हूं')}
            error={errors.vegOnlyDiet}
            required
          />
          <Checkbox
            checked={!!data.agreesToRules}
            onChange={(e) => onChange('agreesToRules', e.target.checked)}
            label={t(`I have read and agree to abide by all Rules & Regulations of the ${placeEn}`, `मैंने ${placeHi} के सभी नियमों और विनियमों को पढ़ लिया है और उनका पालन करने के लिए सहमत हूं`)}
            error={errors.agreesToRules}
            required
          />
          <Checkbox
            checked={!!data.attendsPathshala}
            onChange={(e) => onChange('attendsPathshala', e.target.checked)}
            label={t('I will attend Pathshala (Religious Classes), daily Abhishek, Aarti, Assembly and Roll Call as required', 'मैं आवश्यकतानुसार पाठशाला (धार्मिक कक्षाएं), दैनिक अभिषेक, आरती, सभा और रोल कॉल में उपस्थित रहूंगा/रहूंगी')}
            error={errors.attendsPathshala}
            required
          />
          <Checkbox
            checked={!!data.noProhibitedItems}
            onChange={(e) => onChange('noProhibitedItems', e.target.checked)}
            label={t('I will not consume tobacco, alcohol, drugs or any intoxicants, and will not possess prohibited items (sharp articles, electrical gadgets, playing cards, etc.)', 'मैं तंबाकू, शराब, ड्रग्स या किसी भी नशीले पदार्थ का सेवन नहीं करूंगा/करूंगी, और निषिद्ध वस्तुएं (तेज वस्तुएं, बिजली के उपकरण, ताश के पत्ते आदि) नहीं रखूंगा/रखूंगी')}
            error={errors.noProhibitedItems}
            required
          />
          <Checkbox
            checked={!!data.acceptsDamageLiability}
            onChange={(e) => onChange('acceptsDamageLiability', e.target.checked)}
            label={t('I accept liability for any damage caused to Institute property, intentionally or unintentionally, and agree that the Security Deposit may be forfeited on violation of rules', 'मैं संस्थान की संपत्ति को जानबूझकर या अनजाने में हुए किसी भी नुकसान के लिए जिम्मेदारी स्वीकार करता/करती हूं, और सहमत हूं कि नियमों का उल्लंघन होने पर सुरक्षा जमा जब्त की जा सकती है')}
            error={errors.acceptsDamageLiability}
            required
          />
          <Checkbox
            checked={!!data.declarationAccepted}
            onChange={(e) => onChange('declarationAccepted', e.target.checked)}
            label={t('I declare that all information provided in this application is true and correct, and I will vacate the premises if ordered to do so for misconduct or non-payment of dues', 'मैं घोषणा करता/करती हूं कि इस आवेदन में दी गई सभी जानकारी सत्य और सही है, और कदाचार या बकाया का भुगतान न करने पर आदेश दिए जाने पर मैं परिसर खाली कर दूंगा/दूंगी')}
            error={errors.declarationAccepted}
            required
          />
        </div>
      </div>
    </div>
  );
}

export const TERMS_REQUIRED_FIELDS = [
  'isDigamberJain',
  'vegOnlyDiet',
  'agreesToRules',
  'attendsPathshala',
  'noProhibitedItems',
  'acceptsDamageLiability',
  'declarationAccepted',
] as const;

export function validateTermsAndConditions(data: any) {
  const errors: Record<string, string> = {};
  if (!data.isDigamberJain) errors.isDigamberJain = 'You must confirm Digamber Jain community to proceed';
  if (!data.vegOnlyDiet) errors.vegOnlyDiet = 'You must agree to a vegetarian-only diet to proceed';
  if (!data.agreesToRules) errors.agreesToRules = 'You must agree to the Rules & Regulations to proceed';
  if (!data.attendsPathshala) errors.attendsPathshala = 'You must agree to attend Pathshala and daily activities';
  if (!data.noProhibitedItems) errors.noProhibitedItems = 'You must agree to refrain from prohibited substances and items';
  if (!data.acceptsDamageLiability) errors.acceptsDamageLiability = 'You must accept liability for damage to Institute property';
  if (!data.declarationAccepted) errors.declarationAccepted = 'You must accept the declaration to proceed';
  return Object.keys(errors).length > 0 ? errors : null;
}
