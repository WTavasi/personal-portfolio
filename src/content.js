// Single source of truth for everything the site says about Wyclef.
// Only claims that can be backed up belong here: a repo, a date, a number, a named employer.
// Kept in line with the master résumé (Wyclef_Tavasi_Resume_Master.docx).
//
// Contact details below are public. Empty values are not rendered.
// There is no downloadable PDF on purpose: the web résumé at /resume is the shareable version.

export const person = {
  name: 'Wyclef Tavasi',
  headline: 'Cloud, DevOps and mobile engineer',
  location: 'Houston, TX',
  description:
    'Cloud, DevOps and mobile engineer with professional experience since January 2026. Deploys with Docker and AWS (EC2, S3), works with Kubernetes, and builds the apps on top: Android in Kotlin, iOS in Swift, and Node.js and Python back ends. Designs for failure, from escalation chains that fall back to SMS to load balancers that route around dead servers.',
  availability: 'Authorized to work in the US without sponsorship. Available full-time from January 2027.',
};

export const contact = {
  github: 'https://github.com/WTavasi',
  email: 'wycleftavasi@gmail.com',
  linkedin: 'https://www.linkedin.com/in/wycleftavasi/',
};

export const experience = [
  {
    role: 'Software Engineering Associate',
    org: 'Webmasters KE (MzaziCare)',
    when: 'April to December 2026',
    bullets: [
      'Developed the emergency panic-button feature of MzaziCare, an Africa-focused home care platform for the elderly, as part of the organization’s emergency module.',
      'Built the user authentication and login flows, and designed around the failures of unstable third-party African APIs.',
    ],
  },
  {
    role: 'Software Development and IT Support Intern',
    org: 'Delta Creative Solutions',
    when: 'January to March 2026',
    bullets: [
      'Developed, tested and reviewed code for system modules alongside the software development team.',
      'Deployed application solutions in Docker containers, worked in the company’s AWS environment (EC2, S3) and took on-call turns.',
      'Helped the team go from two-week reporting delays to delivering work at least three days ahead of deadline.',
    ],
  },
];

// Only projects with public code are listed, strongest first. (The Kubernetes lab's repo link is
// still to be added.)
export const projects = [
  {
    name: 'MzaziCare emergency escalation (final-year capstone)',
    stack: 'Node.js, PostgreSQL, Redis, Docker',
    year: '2026',
    href: 'https://github.com/WTavasi/elder-emergency-escalation',
    bullets: [
      'Designed and built the alerting subsystem of MzaziCare, a real-time emergency response framework for home-based elderly care. A panic button raises an alert, the system scores its severity from six weighted factors, and the alert travels down a ranked chain of caregiver, family member and emergency responder.',
      'Promotes an alert automatically when a tier does not acknowledge within its timeout, falls back to SMS when push notifications cannot be delivered, and writes every state change to an audit log so each escalation decision can be explained afterward from its stored factor values.',
      'Runs PostgreSQL and Redis in Docker Compose behind an API and a web dashboard, in a monorepo with linting, commit hooks and GitHub Actions workflows. Developed under industry and academic supervisors.',
    ],
  },
  {
    name: 'Distributed load balancer with consistent hashing',
    stack: 'Python, Flask, Docker',
    year: '2026',
    href: 'https://github.com/WTavasi/consistent-hashing-load-balancer',
    bullets: [
      'Spreads requests across a pool of servers using a 512-slot consistent hashing ring with nine virtual nodes per server, so adding or losing a server moves only a small share of traffic.',
      'Detects failed servers with background heartbeat polling and re-routes around them, with the servers managed as containers in a Docker-in-Docker setup.',
    ],
  },
  {
    name: 'Kubernetes multi-service deployment (Widgetario)',
    stack: 'Kubernetes, kubectl, Docker Desktop',
    year: '2026',
    // TODO: add href once the repo is public
    bullets: [
      'Deployed a multi-component e-commerce application to a local Kubernetes cluster through a seven-part hands-on lab, documenting each part.',
    ],
  },
  {
    name: 'FinaTrack: iOS financial portfolio manager',
    stack: 'Swift, UIKit, Xcode, Figma',
    year: '2025',
    href: 'https://github.com/WTavasi/FinaTrack',
    bullets: [
      'Designed and built an iOS app for managing a financial portfolio, with Face ID biometric login so users unlock their finances securely and quickly.',
      'Drove the product design in Figma with wireframes and prototypes. It was presented in a human-computer interaction course as the example of good product design for finance apps.',
    ],
  },
  {
    name: '3D-Solar-Navigator (Project Stellar)',
    stack: 'C++17, CMake, Git',
    year: '2026',
    href: 'https://github.com/WTavasi/3D-Solar-Navigator',
    bullets: [
      'Six-person team project to build a free-roaming 3D navigator of the Solar System in C++, implementing the graphics algorithms (lines, polygons, circles and ellipses, Bezier curves and splines) from scratch.',
      'Owns the testing: independent tests for each algorithm before integration, including the Catmull-Rom spline test, through Git branches and pull requests.',
    ],
  },
  {
    name: 'FleaMart: e-commerce for school businesses',
    stack: 'Java, NetBeans, MySQL, JDBC',
    year: '2025',
    href: 'https://github.com/WTavasi/FleaMart',
    bullets: [
      'Four-person team project: a Java desktop application that lets student business owners manage products, track deliveries and reach new customers, while customers sign up, browse and place orders.',
      'Built the user authentication and login flows against a MySQL database.',
    ],
  },
  {
    name: 'MataPredict: matatu overcrowding prediction',
    stack: 'Python, Google Colab, Excel',
    year: '2026',
    href: 'https://github.com/WTavasi/MataPredict',
    bullets: [
      'Group machine learning project to predict overcrowding on Nairobi matatus. Prepared the team’s data in Excel and produced the data visualizations in Google Colab.',
    ],
  },
];

// Grouped by the work being sought: cloud and DevOps first, then mobile. Languages are split into
// the ones used day to day and the ones used in projects and coursework.
export const skills = [
  [
    'Cloud and DevOps',
    'AWS (EC2, S3, Lambda, RDS, CloudWatch), Docker and Docker Compose, Kubernetes, CI/CD with GitHub Actions and Azure DevOps, Git, monitoring and alerting, on-call support',
  ],
  ['Mobile', 'Android (Kotlin), iOS (Swift, UIKit, SwiftUI), Flutter, Face ID biometric authentication, Figma wireframing and prototyping'],
  [
    'Back end and APIs',
    'Node.js, NestJS, Flask, REST APIs, Redis, authentication and login flows, escalation and alerting logic, third-party APIs (M-Pesa Daraja, Africa’s Talking SMS)',
  ],
  ['Databases', 'PostgreSQL, MySQL, MongoDB, Redis, Firebase Firestore'],
  ['Main languages', 'Python, TypeScript and JavaScript, Swift, SQL'],
  ['Also worked with', 'Kotlin, Java, C#, C, C++, Dart, PowerShell, HTML and CSS'],
  ['Practices', 'Fault tolerance, unit testing and test automation, code reviews, debugging, Agile'],
  [
    'Additional: systems and networking',
    'Linux (Ubuntu, Red Hat, Kali), server administration, VirtualBox and VMware, routing and switching (Cisco CCNA coursework), HTTP, load balancing; ESP32 and Arduino in C',
  ],
];

export const education = [
  {
    title: 'BSc Informatics and Computer Science, Strathmore University, Nairobi, Kenya',
    when: 'Coursework completes December 2026. Degree awarded July 2027.',
    coursework: [
      [
        'Software and web',
        'Object Oriented Programming I and II, Data Structures and Algorithms, Software Engineering, Web Application Development, Internet Application Programming, Mobile Application Development, Human Computer Interaction, Multimedia Applications',
      ],
      [
        'Systems and networking',
        'Operating Systems, Computer Organization and Architecture, Assembly Language Programming, Microprocessors, Digital Logic, Server Administration, Embedded Systems and Internet of Things, Computer Networks, Advanced Networking, Cloud Computing, Distributed Systems, Computer Security and Cryptography',
      ],
      [
        'Data and theory',
        'Database Systems, Advanced Database Systems, Artificial Intelligence, Machine Learning, Computer Simulation and Modelling, Probability and Statistics, Discrete Mathematics, Linear Algebra, Automata Theory and Computability',
      ],
    ],
  },
];

export const certifications = [
  'AWS Academy Graduate: Cloud Foundations and Cloud Security Foundations, Amazon Web Services, 2026',
  'Cisco CCNA: Introduction to Networks (ITN), Cisco Networking Academy, 2025',
  'Cisco CCNA: Switching, Routing, and Wireless Essentials (SRWE), Cisco Networking Academy, 2025',
  'Cisco CCNA: Enterprise Networking, Security, and Automation (ENSA), Cisco Networking Academy, 2025',
  'Apple Swift and CompTIA IT Essentials',
];

// Third-party media used on the site, credited on the résumé page.
export const credits = ['Orchestra tuning recording: "Orchestra Tuning Sound Effect" by Effects Grinder.'];

export const honors = [
  'Represented Kenya at the national Spell It Right spelling bee, placing 10th of over 200 competitors.',
  'Took part in several university hackathons, most recently JengaSec at Strathmore.',
  'Several top-student certificates in high school.',
];

export const interests = 'Music: clarinet and several other instruments, orchestra and band leadership, conducting and arranging.';
