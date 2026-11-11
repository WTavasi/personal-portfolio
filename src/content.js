// Single source of truth for everything the site says about Wyclef.
// Only claims that can be backed up belong here: a repo, a date, a number, a named employer.
//
// Contact details below are public. Empty values are not rendered.
// TODO(wyclef): set resumeUrl if you want a PDF link.

export const person = {
  name: 'Wyclef',
  fullName: 'Tavasi Wyclef Wasike',
  description:
    'Informatics and Computer Science student at Strathmore University, finishing coursework in December 2026. Looking for cloud or networking roles starting January 2027.',
  musicLine: 'Also a trained conductor, arranger and producer, with eight years on clarinet.',
};

export const contact = {
  github: 'https://github.com/WTavasi',
  email: 'wycleftavasi@gmail.com',
  linkedin: 'https://www.linkedin.com/in/wycleftavasi/',
  resumeUrl: '',
};

export const experience = [
  {
    role: 'Software Engineering Associate',
    org: 'Webmasters KE',
    when: 'Since April 2026',
    bullets: [
      'Built the emergency module of MzaziCare, an elderly home care platform: a panic button that escalates automatically from caregiver to family member to emergency responder.',
      'Stack: Flutter, NestJS, PostgreSQL, Redis, Firebase Cloud Messaging, with Africa’s Talking SMS as a fallback.',
    ],
  },
  {
    role: 'Software Development and IT Support Intern',
    org: 'Delta Creative Solutions',
    when: 'January to March 2026',
    bullets: [
      'Worked with Docker and AWS EC2 and S3, tested code, and covered on-call.',
      'Helped move reporting from two-week delays to delivery at least three days ahead of deadline.',
    ],
  },
];

export const projects = [
  {
    name: 'Consistent-hashing load balancer',
    detail:
      'A Flask load balancer on a 512-slot hash ring with nine virtual replicas per server. Backends run as Docker containers, and a Docker-in-Docker setup with background heartbeat polling detects failed servers.',
    href: 'https://github.com/WTavasi/consistent-hashing-load-balancer',
  },
  {
    name: 'MzaziCare emergency escalation',
    detail:
      'My own expansion of the panic button, with voice detection for alerts and automatic escalation through a responder chain.',
    href: 'https://github.com/WTavasi/elder-emergency-escalation',
  },
  {
    name: 'FinaTrack',
    detail:
      'An iOS finance tracker in UIKit and SwiftUI with Face ID sign-in. I wrote its tests for page-load time across devices, update speed and data-volume stress, and tested payment flows with Stripe and M-Pesa.',
    href: 'https://github.com/WTavasi/FinaTrack',
  },
  {
    name: 'Widgetario on Kubernetes',
    detail:
      'Deployed an e-commerce app across a seven-part Kubernetes lab, monitoring container status, pod restarts and cluster health in Grafana.',
  },
];

export const skills = [
  ['Cloud and DevOps', 'Docker, Kubernetes, AWS (EC2, S3), Grafana, Linux (Ubuntu, Red Hat, Kali)'],
  ['Backend', 'NestJS, Flask, FastAPI, PostgreSQL, Redis, MongoDB'],
  ['Mobile', 'Swift (UIKit, SwiftUI), Flutter, React Native'],
  ['Languages', 'Python, Swift, Dart, C, C++, C#, PowerShell'],
  ['Tools', 'Postman, Figma, Azure DevOps, M-Pesa Daraja, Africa’s Talking, Stripe'],
];

export const education = [
  {
    title: 'BSc Informatics and Computer Science, Strathmore University',
    when: 'Coursework complete December 2026, degree conferred July 2027',
  },
  { title: 'AWS Cloud Foundations badge', when: 'AWS Skill Builder' },
];

// Third-party media used on the site, credited on the résumé page.
export const credits = ['Orchestra tuning recording: "Orchestra Tuning Sound Effect" by Effects Grinder.'];

export const music = {
  bullets: [
    'Clarinet for over eight years. Also oboe, alto and tenor saxophone, piano and flute.',
    'Formally trained as a conductor, arranger and music producer, with four years in orchestra including a leadership role.',
    'Became band leader and conductor at a school that had no band. The band won about eight trophies and performed for the president and deputy president on multiple occasions.',
  ],
  honors: [
    'Several top-student certificates in music and overall in high school.',
    'Represented Kenya at the national Spell It Right spelling bee, placing 10th of over 200 competitors.',
    'Took part in several university hackathons, most recently JengaSec at Strathmore.',
  ],
};
