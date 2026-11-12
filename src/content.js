// Single source of truth for everything the site says about Wyclef.
// Only claims that can be backed up belong here: a repo, a date, a number, a named employer.
// Kept in line with the master résumé (Wyclef_Tavasi_Resume_Master.docx).
//
// Contact details below are public. Empty values are not rendered.
// TODO(wyclef): set resumeUrl if you want a PDF link.

export const person = {
  name: 'Wyclef',
  fullName: 'Tavasi Wyclef Wasike',
  location: 'Houston, TX',
  description:
    'Software engineer working across cloud, backend, mobile and distributed systems, with professional experience since January 2026. Builds web, mobile and backend systems in TypeScript, Python, Java, C#, C++, Kotlin and Swift, deploys with Docker and AWS, and has studied Kubernetes, networking (Cisco CCNA curriculum) and cloud security.',
  availability: 'Authorized to work in the US without sponsorship. Available full-time from January 2027.',
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
    name: 'Flora Farms greenhouse monitoring system',
    stack: 'ESP32, C, DHT22, MQ-5, InfluxDB, Grafana',
    year: '2026',
    bullets: [
      'Group project to design a remote monitoring system for a Kenyan flower farm growing sunflowers: researched the ideal temperature, humidity, soil and sunlight ranges and chose the sensors to measure them, including LPG gas detection for the greenhouse heaters.',
      'Drew schematics for three device architectures, then built physical and Wokwi-simulated prototypes with a Wi-Fi microcontroller, temperature and humidity sensor, gas sensor, display and relay, programmed in C.',
      'Streamed sensor readings to a time-series database with a live Grafana dashboard, and presented the solution, results and recommendations to the farm owner.',
    ],
  },
  {
    name: 'Chama-App: group savings and loan management',
    stack: 'Kotlin, Android, Firebase',
    year: '2025',
    bullets: [
      'Six-person team project: an Android app that lets savings groups (chamas) track member contributions, loans and repayments, with different permissions for each role.',
      'Designed the Firebase database, built the user authentication and login flows, and worked on the app’s chatbot.',
      'Led repository management and organization for the team, including the rules and conventions the group followed.',
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
    name: 'Land-Title Verification Registry',
    stack: 'Information systems security design',
    year: '2026',
    bullets: [
      'Six-milestone group project to design a registry that lets buyers verify property ownership, title authenticity, lease status and encumbrances before purchase.',
      'Applied security design principles to protect the system’s assets at every stage, including scoping, risk framing, and access control and authentication design.',
    ],
  },
  {
    name: 'Kubernetes multi-service deployment (Widgetario)',
    stack: 'Kubernetes, kubectl, Docker Desktop',
    year: '2026',
    bullets: [
      'Deployed a multi-component e-commerce application to a local Kubernetes cluster through a seven-part hands-on lab, documenting each part.',
    ],
  },
];

export const skills = [
  ['Languages', 'Python, TypeScript, JavaScript, Java, C#, C, C++, Kotlin, Swift, Dart, SQL, PowerShell, HTML and CSS'],
  [
    'Front end and mobile',
    'React, Flutter, Android (Kotlin), iOS (Swift, UIKit, SwiftUI), Face ID biometric authentication, Figma wireframing and prototyping',
  ],
  [
    'Back end and APIs',
    'REST APIs, NestJS, Node.js, Flask, Redis, authentication and login flows, escalation and alerting logic, third-party APIs (M-Pesa Daraja, Africa’s Talking SMS)',
  ],
  ['Databases', 'PostgreSQL, MySQL, MongoDB, Redis, Firebase Firestore'],
  [
    'Cloud and DevOps',
    'AWS (EC2, S3, Lambda, RDS, CloudWatch), Docker, Kubernetes, Git, GitHub, CI/CD, Azure DevOps, monitoring and alerting',
  ],
  ['Embedded and IoT', 'ESP32 and Arduino in C, DHT22 and MQ-5 sensors, relays, Wokwi simulation, InfluxDB, Grafana'],
  [
    'Systems and networking',
    'Linux (Ubuntu, Red Hat, Kali), VirtualBox, VMware, server administration, routing and switching (CCNA curriculum), HTTP, load balancing',
  ],
  [
    'Practices',
    'Unit testing and test automation, code reviews, debugging, on-call support, fault tolerance, Agile and waterfall, A/B testing, user research',
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
  'Cisco CCNA: Introduction to Networks (ITN), Cisco Networking Academy, 2025',
  'Cisco CCNA: Switching, Routing, and Wireless Essentials (SRWE), Cisco Networking Academy, 2025',
  'Cisco CCNA: Enterprise Networking, Security, and Automation (ENSA), Cisco Networking Academy, 2025',
  'AWS Academy Graduate: Cloud Foundations and Cloud Security Foundations, Amazon Web Services, 2026',
  'Apple Swift and CompTIA IT Essentials',
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
