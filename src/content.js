// Single source of truth for everything the site says about Wyclef.
// Only claims that can be backed up belong here: a repo, a date, a number, a named employer.
// Kept in line with the master résumé (Wyclef_Tavasi_Resume_Master.docx).
//
// Contact details below are public. Empty values are not rendered.
// There is no downloadable PDF on purpose: the web résumé at /resume is the shareable version.

export const person = {
  name: 'Wyclef Tavasi',
  headline: 'Cloud, DevOps and software engineer',
  location: 'Houston, TX',
  description:
    'Cloud, DevOps and software engineer with professional experience since January 2026. Deploys with Docker and AWS (EC2, S3), works with Kubernetes, and builds the apps on top: Android in Kotlin, iOS in Swift, and Node.js and Python back ends. Designs for failure, from escalation chains that fall back to SMS to load balancers that route around dead servers.',
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
      'Built the emergency panic-button feature and the authentication and login flows for MzaziCare, an Africa-focused elder home-care platform, designing around unreliable third-party African APIs.',
      'Backed the work with 1,417 automated tests and 12 system tests; real-time alert updates reached the elder’s care circle within 16 ms while users outside the circle received nothing.',
    ],
  },
  {
    role: 'Software Development and IT Support Intern',
    org: 'Delta Creative Solutions',
    when: 'January to March 2026',
    bullets: [
      'Deployed application services in Docker on AWS (EC2, S3), took on-call turns, and developed, tested and reviewed code for system modules with the development team.',
      'Helped the team go from two-week reporting delays to delivering at least three days ahead of deadline.',
    ],
  },
];

// Music, leadership and community roles: the same measurable wording on the site and the résumé
// (what, at what scale, for how long, the result). Agreed in the design document, section 11.
export const leadership = [
  {
    role: 'Principal clarinet',
    org: 'Kenya Conservatoire of Music Orchestra and Prelude Orchestra',
    when: 'January 2023 to present',
    bullets: [
      'Principal clarinet of both orchestras at the same time for nearly four years: lead a section of 4 clarinettists, run sectionals and write custom section arrangements, across over 15 concerts and a repertoire of more than a dozen major works, from Beethoven and Brahms to film scores.',
    ],
  },
  {
    role: 'Clarinet and music mentor',
    org: 'Harmony Kenya Foundation',
    when: 'December 2022 to present',
    bullets: [
      'Mentor 13 students a week in clarinet and music across around 7 primary and high schools in Nairobi, with some going on to join orchestras across the country, including the Kenya Conservatoire of Music Symphony Orchestra (KCMSO), and passing their KCSE (Kenya Certificate of Secondary Education) music practical and theory tests.',
    ],
  },
  {
    role: 'Band leader and conductor',
    org: 'Nairobi School',
    when: '2021 to 2022',
    bullets: [
      'Led and conducted the almost 50-member school band for a year: rehearsals five days a week (hymns four days, marching drill one), festival and event preparation, and improvements to the music department; took the band to national level, won 9 trophies and 6 certificates, and conducted it at the State House winners’ gala before the President and Deputy President, a rare opportunity for a student conductor.',
    ],
  },
  {
    role: 'Choir member and choral singer',
    org: 'Nairobi School choir; Kenya Conservatoire Choir',
    when: '2019 to 2021; May to July 2026',
    bullets: [
      'Sang in the Nairobi School choir from 2019 to 2021 and with 2 choirs outside school, including a performance of Mozart’s Lacrimosa with the Kenya Conservatoire Choir in July 2026 after rehearsing from May.',
    ],
  },
  {
    role: 'Volunteer teaching assistant',
    org: 'Ngei Primary School',
    when: 'January to April 2025',
    community: true,
    bullets: [
      'Taught 2 computer classes and supported teachers across 9 classes for four months: learning materials and visual aids, drama-festival rehearsals, admissions, library cataloguing, exam invigilation and marking; helped teachers finish work several weeks ahead of schedule.',
    ],
  },
];

// Only projects with public code are listed, strongest first. (The Kubernetes lab's repo link is
// still to be added.)
export const projects = [
  {
    name: 'MzaziCare emergency escalation (final-year capstone)',
    slug: 'mzazicare',
    oneLine: 'An emergency alert that reaches someone who can help, even when the network does not.',
    role: 'Designed and built the alerting subsystem',
    results: [
      '1,417 automated tests and 12 system tests.',
      'Real-time alert updates reach the elder’s care circle within 16 ms; users outside the circle receive nothing.',
    ],
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
    slug: 'load-balancer',
    oneLine: 'A load balancer that keeps routing when servers come and go.',
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
    slug: 'kubernetes-widgetario',
    oneLine: 'A multi-service shop deployed to Kubernetes, one documented step at a time.',
    stack: 'Kubernetes, kubectl, Docker Desktop',
    year: '2026',
    // TODO: add href once the repo is public
    bullets: [
      'Deployed a multi-component e-commerce application to a local Kubernetes cluster through a seven-part hands-on lab, documenting each part.',
    ],
  },
  {
    name: 'FinaTrack: iOS financial portfolio manager',
    slug: 'finatrack',
    oneLine: 'A finance app that opens with your face, designed before it was built.',
    role: 'Product design and iOS build',
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
    slug: 'solar-navigator',
    oneLine: 'A free-roaming Solar System in C++, with every graphics algorithm written from scratch.',
    role: 'Testing lead in a six-person team',
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
    slug: 'fleamart',
    oneLine: 'A desktop shop for student businesses and their customers.',
    role: 'Authentication and login, in a four-person team',
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
    slug: 'matapredict',
    oneLine: 'Predicting when Nairobi’s matatus will be overcrowded.',
    role: 'Data preparation and visualisation, in a group project',
    stack: 'Python, Google Colab, Excel',
    year: '2026',
    href: 'https://github.com/WTavasi/MataPredict',
    bullets: [
      'Group machine learning project to predict overcrowding on Nairobi matatus. Prepared the team’s data in Excel and produced the data visualizations in Google Colab.',
    ],
  },
];

// Wyclef's own list (2026-11-23), cloud and DevOps first. Languages keep the split into the ones
// used day to day and the ones used in projects and coursework.
export const skills = [
  ['Cloud and DevOps', 'AWS (EC2, S3, VPC, IAM, Lambda, RDS, CloudWatch, CloudTrail, KMS), Azure, Docker, Kubernetes, Git, GitHub, CI/CD fundamentals'],
  [
    'Systems and networking',
    'Linux system administration, user and group management, SSH, TCP/IP, Cisco routing, switching and wireless, network security and automation, load balancing, consistent hashing, cryptography and encryption fundamentals',
  ],
  ['Main languages', 'Python, JavaScript, Swift, SQL'],
  ['Also worked with', 'Bash, Java, Kotlin, C++, C, Dart, HTML and CSS'],
  ['Frameworks and tools', 'NestJS, Node.js, Flask, React, Flutter, Firebase, BullMQ, Postman, REST APIs, Xcode, Android Studio'],
  ['Databases', 'PostgreSQL, MySQL, Redis, Firebase Firestore and Realtime Database'],
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
export const credits = [
  'Orchestra tuning recording: “Orchestra Tuning Sound Effect” by Effects Grinder.',
  'Audience chatter: “People Talking in Background, Version 1” by Finnolia Sound Effects.',
  'Type: Source Serif 4 and Source Code Pro (Adobe), under the SIL Open Font License.',
];

export const honors = [
  'Represented Kenya at the national Spell It Right spelling bee, placing 10th of over 200 competitors.',
  'Took part in several university hackathons, most recently JengaSec at Strathmore.',
  'Several top-student certificates in high school.',
];

export const interests = 'Music: principal clarinet, choral singing, conducting and arranging; film and TV, games and reading.';

// The Studio. Repertoire as Wyclef listed it, in two lists.
export const music = {
  conductingVideo: { href: 'https://youtu.be/2LJcng0SELA', label: 'Watch the Nairobi School band, conducted by Wyclef (YouTube)' },
  chamber: 'Recitals in duos, a clarinet quartet and several solo performances.',
  repertoire: {
    classical: [
      'Beethoven, Symphony No. 5 (fourth movement)',
      'Brahms, Symphony No. 1',
      'Brahms, Tragic Overture',
      'Holst, First and Second Suites for military band',
      'Holst, “Jupiter” from The Planets',
      'Mozart, Eine kleine Nachtmusik (arranged for winds)',
      'Mozart, Lacrimosa from the Requiem',
      'Stravinsky, Berceuse and Finale from The Firebird',
      'Tchaikovsky, “Waltz of the Flowers” from The Nutcracker',
    ],
    contemporary: ['Hamilton suite', 'Guardians of the Galaxy suite'],
  },
};

// Box Office. No prices until decided; every service ends in a request for a quote.
export const services = {
  engineering: [
    ['Websites and web apps', 'For small businesses, artists and organisations.'],
    ['Cloud set-up and deployment', 'AWS, Docker and CI/CD, including moving a site off shared hosting.'],
    ['Mobile apps', 'iOS and Android.'],
    ['System design reviews', 'Will it scale, and what fails first?'],
  ],
  music: [
    ['Arrangement', 'For choirs, bands and small orchestras.'],
    ['Composition', 'For film, games and media.'],
    ['Production and mixing', 'Of recordings.'],
    ['Music for your product', 'Sound for an app or a site like this one.'],
  ],
  process: [
    ['Brief', 'You tell me what you need and by when.'],
    ['Plan', 'A written plan and a quote.'],
    ['Build or record', 'With a check-in at each milestone.'],
    ['Hand over', 'Code, files or recordings, with the notes to keep them going.'],
  ],
  international: 'Based in Houston (US Central Time) and working with clients worldwide. Quotes are in US dollars; meetings are arranged across time zones.',
};

// The v0.6 "fun facts". They no longer interrupt the panels (design rules: no filler, nothing
// pushed in front of content). Kept for the hidden programme notes planned for stage S4; whether
// to use these or write new ones is an open question in the design document.
export const programmeNotes = {
  about: 'Conducting with a baton only became usual in the early 1800s. Before that, orchestras were usually led from the keyboard or by the first violinist.',
  experience: 'A violin bow is strung with roughly 150 to 200 hairs from a horse’s tail. Rosin makes them grip the string so it vibrates.',
  projects: 'The whole orchestra tunes to an A played by the oboe, because its clear, steady tone carries across the stage.',
  skills: 'Uncoiled, the tubing of a French horn in F is about 3.7 metres (12 feet) long.',
  certifications: 'The glockenspiel sounds two octaves higher than it is written, so its part stays on the staff instead of floating above it.',
  education: 'Beethoven’s Ninth Symphony (1824) was one of the first major symphonies to bring a choir into the music.',
};
