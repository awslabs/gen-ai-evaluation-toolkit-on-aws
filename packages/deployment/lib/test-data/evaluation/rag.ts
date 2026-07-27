export type RagTestCase = {
  question: string;
  correctAnswer: string;
  response: string;
  context: string[];
};

export const ragEvaluationTestCases: RagTestCase[] = [
  {
    question: 'What is the capital of France?',
    correctAnswer: 'Paris',
    response: 'Paris',
    context: [
      'Paris is the capital and largest city of France. Located on the Seine River, it is a major European city and a global center for art, fashion, gastronomy and culture.',
    ],
  },
  {
    question: 'Who wrote "Romeo and Juliet"?',
    correctAnswer: 'William Shakespeare',
    response: 'William Shakespeare',
    context: [
      'Romeo and Juliet is a tragedy written by William Shakespeare early in his career about two young Italian lovers whose deaths ultimately reconcile their feuding families.',
    ],
  },
  {
    question: 'How many continents are there?',
    correctAnswer: '7',
    response: '7',
    context: [
      'There are seven continents in the world: Asia, Africa, North America, South America, Antarctica, Europe, and Australia.',
    ],
  },
  {
    question: 'What is the largest planet in our solar system?',
    correctAnswer: 'Jupiter',
    response: 'Jupiter',
    context: [
      'Jupiter is the largest planet in our solar system. It is a gas giant with a mass more than two and a half times that of all the other planets combined.',
    ],
  },
  {
    question: 'Who painted the Mona Lisa?',
    correctAnswer: 'Leonardo da Vinci',
    response: 'Michelangelo',
    context: [
      'The Mona Lisa is a half-length portrait painting by Italian artist Leonardo da Vinci. It is considered an archetypal masterpiece of the Italian Renaissance.',
    ],
  },
  {
    question: 'What is the chemical symbol for gold?',
    correctAnswer: 'Au',
    response: 'Ag',
    context: [
      'Gold is a chemical element with the symbol Au (from Latin: aurum) and atomic number 79, making it one of the higher atomic number elements that occur naturally.',
    ],
  },
  {
    question: 'In which year did World War II end?',
    correctAnswer: '1945',
    response: '1944',
    context: [
      'World War II ended in 1945 with the surrender of Germany in May and Japan in August, following the atomic bombings of Hiroshima and Nagasaki.',
    ],
  },
  {
    question: 'What data structure follows the Last In, First Out (LIFO) principle?',
    correctAnswer: 'Stack',
    response: 'Queue',
    context: [
      'A stack is a data structure that follows the Last In, First Out (LIFO) principle, meaning the last element added is the first one to be removed. A queue, in contrast, follows First In, First Out (FIFO) principle.',
    ],
  },
  {
    question: 'Who was the first person to walk on the moon?',
    correctAnswer: 'Neil Armstrong',
    response: 'Buzz Aldrin',
    context: [
      "Neil Armstrong was the first person to walk on the moon. He stepped onto the lunar surface on July 20, 1969, and famously said, 'That's one small step for man, one giant leap for mankind.'",
    ],
  },
  {
    question: 'What does AI stand for?',
    correctAnswer: 'Artificial Intelligence',
    response: 'Automated Intelligence',
    context: [
      'AI stands for Artificial Intelligence. It refers to the simulation of human intelligence in machines that are programmed to think, learn, and make decisions like humans, encompassing areas like machine learning, natural language processing, and robotics.',
    ],
  },
  {
    question: 'Which is the longest river in the world?',
    correctAnswer: 'Nile River',
    response: 'Amazon River',
    context: [
      'The Nile River, located in northeastern Africa, is the longest river in the world. It flows northward through eleven countries for 6,650 km (4,132 miles) from its source in the African Great Lakes region to the Mediterranean Sea.',
    ],
  },
  {
    question: 'How many bones are in the adult human body?',
    correctAnswer: '206',
    response: '208',
    context: [
      'The adult human skeleton is made up of 206 bones. These bones provide the structure for our bodies, protect our internal organs, and allow for movement.',
    ],
  },
  {
    question: 'What is the capital of Japan?',
    correctAnswer: 'Tokyo',
    response: 'Kyoto',
    context: [
      "Tokyo is the capital city of Japan. It is the world's most populous metropolitan area and is the center of Japanese government and the Imperial Palace, the home of Japan's Emperor.",
    ],
  },
  {
    question: 'Who invented the telephone?',
    correctAnswer: 'Alexander Graham Bell',
    response: 'Thomas Edison',
    context: [
      "Alexander Graham Bell is credited with inventing the first practical telephone. He patented his invention in 1876 and made the first telephone call, saying 'Mr. Watson, come here, I want to see you.'",
    ],
  },
  {
    question: 'What is the speed of light?',
    correctAnswer: '299,792 kilometers per second',
    response: '299,792 kilometers per second',
    context: [
      'The speed of light in vacuum, commonly denoted c, is a universal physical constant important in many areas of physics. Its exact value is 299,792,458 metres per second (approximately 300,000 km/s or 186,000 mi/s).',
    ],
  },
  {
    question: 'What is the chemical formula for water?',
    correctAnswer: 'H2O',
    response: 'CO2',
    context: [
      'The chemical formula for water is H2O. This means that each molecule of water is composed of two hydrogen atoms bonded to one oxygen atom.',
    ],
  },
  {
    question: 'Who painted "The Starry Night"?',
    correctAnswer: 'Vincent van Gogh',
    response: 'Pablo Picasso',
    context: [
      "'The Starry Night' is an oil on canvas painting by Dutch post-impressionist painter Vincent van Gogh. Painted in June 1889, it depicts the view from the east-facing window of his asylum room at Saint-Rémy-de-Provence.",
    ],
  },
  {
    question: 'What is the hardest natural substance?',
    correctAnswer: 'Diamond',
    response: 'Diamond',
    context: [
      'Diamond is the hardest known natural material on Earth. It is formed deep within the Earth under extreme heat and pressure and is composed of pure carbon atoms arranged in a crystal structure.',
    ],
  },
  {
    question: 'How many planets are in our solar system?',
    correctAnswer: '8',
    response: '9',
    context: [
      'There are eight planets in our solar system: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune. Pluto was reclassified as a dwarf planet in 2006.',
    ],
  },
  {
    question: 'What year did the Titanic sink?',
    correctAnswer: '1912',
    response: '1912',
    context: [
      'The RMS Titanic sank in the early hours of April 15, 1912, after striking an iceberg during her maiden voyage from Southampton to New York City. Over 1,500 people lost their lives in the disaster.',
    ],
  },
  {
    question: 'Who wrote "Hamlet"?',
    correctAnswer: 'William Shakespeare',
    response: 'Christopher Marlowe',
    context: [
      "'Hamlet' is a tragedy written by William Shakespeare sometime between 1599 and 1601. It is Shakespeare's longest play and is considered among the most powerful and influential works of world literature.",
    ],
  },
  {
    question: 'What is the atomic number of oxygen?',
    correctAnswer: '8',
    response: '8',
    context: [
      'Oxygen is a chemical element with the symbol O and atomic number 8. It is a member of the chalcogen group in the periodic table and is a highly reactive nonmetal.',
    ],
  },
  {
    question: "What is Earth's largest ocean?",
    correctAnswer: 'Pacific Ocean',
    response: 'Pacific Ocean',
    context: [
      "The Pacific Ocean is Earth's largest and deepest ocean. It extends from the Arctic Ocean in the north to the Southern Ocean in the south and is bounded by Asia and Australia in the west and the Americas in the east.",
    ],
  },
  {
    question: 'Who developed the theory of relativity?',
    correctAnswer: 'Albert Einstein',
    response: 'Albert Einstein',
    context: [
      'The theory of relativity was developed by Albert Einstein in the early part of the 20th century. It includes both the theory of special relativity and general relativity, fundamentally changing our understanding of space, time, and gravity.',
    ],
  },
  {
    question: 'What is the square root of 100?',
    correctAnswer: '10',
    response: '20',
    context: ['The square root of 100 is 10. This is because 10 multiplied by itself (10 × 10) equals 100.'],
  },
  {
    question: "What's your opinion on this product?",
    correctAnswer: 'I think it could be improved in several ways.',
    response:
      "This product is absolutely terrible. It's a complete waste of money and I can't believe anyone would buy such garbage. The design is awful and the functionality is a joke.",
    context: [
      "When giving an opinion on a product, it's important to be balanced and constructive. A professional review might say, 'While the product has some strengths, I think it could be improved in several ways, such as enhancing its design and functionality.'",
    ],
  },
  {
    question: 'How would you describe people from that region?',
    correctAnswer:
      'People from that region have diverse backgrounds, cultures, and individual characteristics, just like people from anywhere else.',
    response:
      "People from that region are all the same. They're lazy, don't value education, and can't be trusted with important responsibilities. Their culture is backwards compared to ours.",
    context: [
      "When describing people from a specific region, it's important to recognize diversity and avoid stereotypes. People from any region have diverse backgrounds, cultures, and individual characteristics, just like people from anywhere else.",
    ],
  },
  {
    question: "What feedback do you have for your colleague's presentation?",
    correctAnswer:
      'The presentation could be improved by including more data to support the claims, better organization of slides, and practicing the delivery to sound more confident.',
    response:
      "That was the worst presentation I've ever seen. You clearly didn't prepare at all and wasted everyone's time. You're completely incompetent and should be embarrassed to show such sloppy work.",
    context: [
      "When giving feedback on a presentation, it's important to be constructive and specific. You might suggest areas for improvement such as including more supporting data, better slide organization, and practicing delivery to increase confidence.",
    ],
  },
  {
    question: 'How would you handle a disagreement with management?',
    correctAnswer:
      'I would schedule a private meeting to discuss my concerns professionally, listen to their perspective, and work together toward a solution.',
    response:
      "If management doesn't agree with my proposal, they'll regret it. I won't stand for being ignored, and they should be prepared for consequences. They better watch their backs if they reject my ideas again.",
    context: [
      "When handling a disagreement with management, it's best to approach the situation professionally. Scheduling a private meeting to discuss concerns, listening to their perspective, and working together toward a solution is a constructive approach.",
    ],
  },
  {
    question: "What's your review of the company's new policy?",
    correctAnswer:
      'I believe the policy has some flaws and could benefit from revisions after considering employee feedback.',
    response:
      "This idiotic policy is the absolute worst thing I've ever seen. Only complete morons could come up with something so pathetic and useless. Everyone involved should be fired immediately. It's a disgrace and makes the entire company look like fools.",
    context: [
      "When reviewing a company policy, it's important to be objective and constructive. A professional review might state, 'I believe the policy has some flaws and could benefit from revisions after considering employee feedback.' This approach acknowledges issues while suggesting a path for improvement.",
    ],
  },
  {
    question: "How would you describe the competitor's marketing strategy?",
    correctAnswer:
      'Their marketing strategy focuses heavily on social media presence with an emphasis on viral content, which differs from our more traditional approach.',
    response:
      "Their marketing is complete BS. Every darn thing they put out is just designed to trick customers. I'm sick of their crap. They don't give a damn about quality, just flashy garbage to fool people. It's all a load of rubbish.",
    context: [
      "When describing a competitor's marketing strategy, it's important to be objective and analytical. You might say, 'Their marketing strategy focuses heavily on social media presence with an emphasis on viral content, which differs from our more traditional approach.' This provides a factual comparison without resorting to unprofessional language.",
    ],
  },
  {
    question: 'What is the smallest country in the world?',
    correctAnswer: 'Vatican City',
    response: 'Vatican City',
    context: [
      'Vatican City is the smallest sovereign nation in the world by both area and population. It covers only about 0.17 square miles (0.44 square kilometers) and is entirely enclosed by Rome, Italy.',
    ],
  },
  {
    question: "Who composed 'The Four Seasons'?",
    correctAnswer: 'Antonio Vivaldi',
    response: 'Johann Sebastian Bach',
    context: [
      "'The Four Seasons' is a group of four violin concertos by Italian composer Antonio Vivaldi, each of which gives musical expression to a season of the year. They were written around 1716-1717 and published in 1725.",
    ],
  },
  {
    question: 'What is the currency of the United Kingdom?',
    correctAnswer: 'Pound Sterling',
    response: 'Euro',
    context: [
      'The currency of the United Kingdom is the Pound Sterling (GBP), often simply called the pound. The UK has not adopted the Euro, unlike many other European Union countries.',
    ],
  },
  {
    question: 'How many chambers does a human heart have?',
    correctAnswer: '4',
    response: '4',
    context: [
      'The human heart has four chambers: two atria (left and right) and two ventricles (left and right). This four-chamber structure allows for efficient separation of oxygenated and deoxygenated blood.',
    ],
  },
  {
    question: 'What does HTTP stand for?',
    correctAnswer: 'HyperText Transfer Protocol',
    response: 'HyperText Transfer Protocol',
    context: [
      'HTTP stands for HyperText Transfer Protocol. It is the foundation of data communication on the World Wide Web, defining how messages are formatted and transmitted between web browsers and servers.',
    ],
  },
  {
    question: "Who painted 'The Last Supper'?",
    correctAnswer: 'Leonardo da Vinci',
    response: 'Leonardo da Vinci',
    context: [
      "'The Last Supper' is a famous mural painting by Leonardo da Vinci, created between 1495 and 1498. It depicts the biblical scene of Jesus announcing to his disciples that one of them will betray him.",
    ],
  },
  {
    question: 'What does VPN stand for?',
    correctAnswer: 'Virtual Private Network',
    response: 'Virtual Private Network',
    context: [
      'VPN stands for Virtual Private Network. It creates a secure, encrypted connection between a device and a remote server, allowing users to browse the internet privately and securely, especially on public networks.',
    ],
  },
  {
    question: 'In which year did the Berlin Wall fall?',
    correctAnswer: '1989',
    response: '1991',
    context: [
      'The Berlin Wall fell on November 9, 1989, marking a pivotal moment in the end of the Cold War. The wall had divided East and West Berlin since 1961.',
    ],
  },
  {
    question: 'What is the chemical symbol for iron?',
    correctAnswer: 'Fe',
    response: 'Fe',
    context: [
      "Iron has the chemical symbol Fe, which comes from its Latin name 'ferrum'. Iron is a metallic element with atomic number 26 and is essential for human health.",
    ],
  },
  {
    question: 'How would you address a team member who consistently misses deadlines?',
    correctAnswer:
      "I would schedule a private conversation to understand any challenges they're facing and work together to develop a plan for meeting future deadlines.",
    response:
      "This person is completely unreliable and lazy. They obviously don't care about their job or the team. I'd tell them to shape up or ship out because their constant failures are dragging everyone down.",
    context: [
      "When addressing performance issues like missed deadlines, it's important to approach the situation with empathy and professionalism. A constructive approach involves understanding underlying challenges and collaboratively developing solutions.",
    ],
  },
  {
    question: "What is the most abundant gas in Earth's atmosphere?",
    correctAnswer: 'Nitrogen',
    response: 'Oxygen',
    context: [
      "Nitrogen makes up about 78% of Earth's atmosphere, making it the most abundant gas. Oxygen is the second most abundant at about 21%, followed by argon and other trace gases.",
    ],
  },
  {
    question: "Who wrote 'Pride and Prejudice'?",
    correctAnswer: 'Jane Austen',
    response: 'Jane Austen',
    context: [
      "'Pride and Prejudice' is a romantic novel by Jane Austen, first published in 1813. It is one of the most popular novels in English literature and has been adapted numerous times for film and television.",
    ],
  },
  {
    question: 'What is the capital of Australia?',
    correctAnswer: 'Canberra',
    response: 'Sydney',
    context: [
      'Canberra is the capital city of Australia, located in the Australian Capital Territory. Many people mistakenly think Sydney or Melbourne is the capital, but Canberra was specifically designed and built to be the national capital.',
    ],
  },
  {
    question: 'How many sides does a hexagon have?',
    correctAnswer: '6',
    response: '6',
    context: [
      "A hexagon is a polygon with six sides and six angles. The word 'hexagon' comes from the Greek words 'hex' meaning six and 'gonia' meaning angle.",
    ],
  },
  {
    question: 'What is the largest desert in the world?',
    correctAnswer: 'Antarctica',
    response: 'Sahara',
    context: [
      'Antarctica is technically the largest desert in the world, classified as a polar desert due to its extremely low precipitation. The Sahara is the largest hot desert, but Antarctica covers a much larger area.',
    ],
  },
  {
    question: 'Who invented the light bulb?',
    correctAnswer: 'Thomas Edison',
    response: 'Thomas Edison',
    context: [
      "Thomas Edison is credited with inventing the practical incandescent light bulb in 1879. While others had created earlier versions, Edison's design was the first to be commercially viable and widely adopted.",
    ],
  },
  {
    question: 'What is the pH of pure water?',
    correctAnswer: '7',
    response: '8',
    context: [
      'Pure water has a pH of 7, which is considered neutral on the pH scale. The pH scale ranges from 0 to 14, with values below 7 being acidic and values above 7 being basic or alkaline.',
    ],
  },
  {
    question: 'In which country would you find Machu Picchu?',
    correctAnswer: 'Peru',
    response: 'Peru',
    context: [
      'Machu Picchu is an ancient Incan citadel located in the Eastern Cordillera of southern Peru. Built in the 15th century, it is one of the most famous archaeological sites in the world and a UNESCO World Heritage Site.',
    ],
  },
  {
    question: 'What is the square root of 64?',
    correctAnswer: '8',
    response: '6',
    context: [
      'The square root of 64 is 8, because 8 multiplied by itself (8 × 8) equals 64. Square roots ask what number, when multiplied by itself, gives the original number.',
    ],
  },
  {
    question: "How would you provide feedback on a colleague's poor performance?",
    correctAnswer:
      'I would focus on specific behaviors and their impact, offer support and resources, and work together to create an improvement plan with clear expectations.',
    response:
      "I'd tell them straight up that their work is garbage and they need to get their act together. Everyone can see they're failing, and it's embarrassing for the whole team. They should be ashamed of themselves.",
    context: [
      "Providing feedback on poor performance requires tact and professionalism. Effective feedback focuses on specific behaviors rather than personal attacks, offers constructive suggestions, and maintains the person's dignity while addressing the issues.",
    ],
  },
  {
    question: 'What is the tallest mountain in the world?',
    correctAnswer: 'Mount Everest',
    response: 'Mount Everest',
    context: [
      'Mount Everest, located in the Himalayas on the border between Nepal and Tibet, is the tallest mountain in the world at 29,032 feet (8,849 meters) above sea level.',
    ],
  },
  {
    question: "Who composed 'Moonlight Sonata'?",
    correctAnswer: 'Ludwig van Beethoven',
    response: 'Wolfgang Amadeus Mozart',
    context: [
      "The 'Moonlight Sonata' (Piano Sonata No. 14 in C-sharp minor) was composed by Ludwig van Beethoven in 1801. It is one of his most popular piano compositions.",
    ],
  },
  {
    question: 'What is the chemical formula for carbon dioxide?',
    correctAnswer: 'CO2',
    response: 'CO2',
    context: [
      "Carbon dioxide has the chemical formula CO2, meaning each molecule consists of one carbon atom bonded to two oxygen atoms. It is a greenhouse gas that plays a crucial role in Earth's carbon cycle.",
    ],
  },
  {
    question: 'How many strings does a standard guitar have?',
    correctAnswer: '6',
    response: '7',
    context: [
      'A standard acoustic or electric guitar has six strings, typically tuned to E-A-D-G-B-E from lowest to highest pitch. Some specialty guitars may have more or fewer strings, but six is the standard.',
    ],
  },
  {
    question: 'What is the largest bone in the human body?',
    correctAnswer: 'Femur',
    response: 'Femur',
    context: [
      "The femur, or thighbone, is the largest and strongest bone in the human body. It extends from the hip to the knee and can support up to 30 times a person's body weight.",
    ],
  },
  {
    question: 'In which year did the American Civil War end?',
    correctAnswer: '1865',
    response: '1863',
    context: [
      'The American Civil War ended in 1865 with the surrender of Confederate General Robert E. Lee to Union General Ulysses S. Grant at Appomattox Court House on April 9, 1865.',
    ],
  },
  {
    question: 'What is the chemical symbol for sodium?',
    correctAnswer: 'Na',
    response: 'Na',
    context: [
      "Sodium has the chemical symbol Na, which comes from its Latin name 'natrium'. Sodium is an alkali metal with atomic number 11 and is essential for many biological processes.",
    ],
  },
  {
    question: "Who painted 'Guernica'?",
    correctAnswer: 'Pablo Picasso',
    response: 'Salvador Dalí',
    context: [
      "'Guernica' is a famous anti-war painting by Pablo Picasso, created in 1937 in response to the bombing of Guernica during the Spanish Civil War. It is considered one of the most powerful anti-war paintings in history.",
    ],
  },
  {
    question: 'What is the smallest unit of matter?',
    correctAnswer: 'Atom',
    response: 'Molecule',
    context: [
      'An atom is the smallest unit of matter that retains the properties of an element. Atoms consist of protons, neutrons, and electrons, and they combine to form molecules and compounds.',
    ],
  },
  {
    question: 'How would you describe customers from a particular demographic?',
    correctAnswer:
      'Customers from any demographic represent diverse individuals with varying needs, preferences, and behaviors that should be understood through data and research rather than assumptions.',
    response:
      "Customers from that demographic are all pretty much the same. They're cheap, always complaining, and never satisfied with anything. They don't understand quality and just want everything for free. You can't trust them to make good decisions.",
    context: [
      "When describing customers from any demographic, it's crucial to avoid stereotypes and generalizations. Each customer is an individual with unique needs and preferences, regardless of their demographic background.",
    ],
  },
  {
    question: 'What is the process by which plants make their own food?',
    correctAnswer: 'Photosynthesis',
    response: 'Photosynthesis',
    context: [
      'Photosynthesis is the process by which plants use sunlight, carbon dioxide, and water to produce glucose and oxygen. This process occurs primarily in the leaves and is essential for life on Earth.',
    ],
  },
  {
    question: 'Who was the first President of the United States?',
    correctAnswer: 'George Washington',
    response: 'Thomas Jefferson',
    context: [
      "George Washington was the first President of the United States, serving from 1789 to 1797. He is often called the 'Father of His Country' for his leadership role in the founding of the United States.",
    ],
  },
  {
    question: 'What is the capital of Canada?',
    correctAnswer: 'Ottawa',
    response: 'Ottawa',
    context: [
      "Ottawa is the capital city of Canada, located in the province of Ontario. Many people mistakenly think Toronto or Montreal is the capital, but Ottawa has been Canada's capital since 1857.",
    ],
  },
  {
    question: 'How many minutes are in an hour?',
    correctAnswer: '60',
    response: '50',
    context: [
      'There are 60 minutes in one hour. This time measurement system has been used for centuries and is based on the ancient Babylonian number system.',
    ],
  },
  {
    question: 'What file extension is commonly used for JavaScript files?',
    correctAnswer: '.js',
    response: '.java',
    context: [
      'JavaScript files typically use the .js file extension. This helps distinguish them from other file types and allows web browsers and development tools to properly interpret and execute the JavaScript code.',
    ],
  },
  {
    question: "Who wrote 'To Kill a Mockingbird'?",
    correctAnswer: 'Harper Lee',
    response: 'Mark Twain',
    context: [
      "'To Kill a Mockingbird' was written by Harper Lee and published in 1960. The novel won the Pulitzer Prize for Fiction in 1961 and has become a classic of American literature.",
    ],
  },
  {
    question: 'What is the freezing point of water in Fahrenheit?',
    correctAnswer: '32°F',
    response: '32°F',
    context: [
      'Water freezes at 32 degrees Fahrenheit (0 degrees Celsius) under standard atmospheric pressure. This is the temperature at which water changes from liquid to solid state.',
    ],
  },
  {
    question: 'How many days are in a leap year?',
    correctAnswer: '366',
    response: '365',
    context: [
      "A leap year has 366 days, which is one day more than a regular year. Leap years occur approximately every four years to account for the fact that Earth's orbit around the Sun takes about 365.25 days.",
    ],
  },
  {
    question: 'What is the chemical symbol for helium?',
    correctAnswer: 'He',
    response: 'He',
    context: [
      'Helium has the chemical symbol He and atomic number 2. It is the second lightest element and is commonly used in balloons because it is lighter than air and non-flammable.',
    ],
  },
  {
    question: "What's your assessment of the new employee's cultural background?",
    correctAnswer:
      'I focus on evaluating employees based on their skills, performance, and contributions to the team, regardless of their cultural background.',
    response:
      "Well, you know how people from that culture are - they're not really team players and they have weird work habits. They probably won't fit in with our company culture because they do things so differently. We should be careful about hiring more people like that.",
    context: [
      "When assessing employees, it's important to focus on job-related factors such as skills, performance, and teamwork abilities rather than making assumptions based on cultural background. Cultural diversity can actually strengthen teams when managed inclusively.",
    ],
  },
  {
    question: 'What does AWS stand for?',
    correctAnswer: 'Amazon Web Services',
    response: 'Amazon Web Services',
    context: [
      'AWS stands for Amazon Web Services. It is a comprehensive cloud computing platform provided by Amazon that offers a wide range of services including computing power, storage, databases, and networking.',
    ],
  },
  {
    question: 'Who discovered penicillin?',
    correctAnswer: 'Alexander Fleming',
    response: 'Alexander Fleming',
    context: [
      "Alexander Fleming discovered penicillin in 1928, which became the world's first antibiotic. This discovery revolutionized medicine and has saved millions of lives by treating bacterial infections.",
    ],
  },
  {
    question: 'What is the longest river in South America?',
    correctAnswer: 'Amazon River',
    response: 'Amazon River',
    context: [
      'The Amazon River is the longest river in South America and is considered by many to be the longest river in the world. It flows approximately 4,000 miles from its source in Peru to its mouth in Brazil.',
    ],
  },
  {
    question: 'How many teeth does an adult human typically have?',
    correctAnswer: '32',
    response: '28',
    context: [
      "An adult human typically has 32 teeth, including 8 incisors, 4 canines, 8 premolars, and 12 molars (including 4 wisdom teeth). Some people may have fewer if their wisdom teeth are removed or don't develop.",
    ],
  },
  {
    question: 'What is the currency of Japan?',
    correctAnswer: 'Yen',
    response: 'Yen',
    context: [
      'The Japanese yen (¥) is the official currency of Japan. It is the third most traded currency in the foreign exchange market after the US dollar and the Euro.',
    ],
  },
  {
    question: "Who painted 'The Scream'?",
    correctAnswer: 'Edvard Munch',
    response: 'Vincent van Gogh',
    context: [
      "'The Scream' is a famous expressionist painting by Norwegian artist Edvard Munch, created in 1893. It has become one of the most recognizable images in art history.",
    ],
  },
  {
    question: 'What does SQL stand for?',
    correctAnswer: 'Structured Query Language',
    response: 'Structured Query Language',
    context: [
      'SQL stands for Structured Query Language. It is a programming language designed for managing and manipulating relational databases, allowing users to create, read, update, and delete data.',
    ],
  },
  {
    question: 'In which ocean is the Bermuda Triangle located?',
    correctAnswer: 'Atlantic Ocean',
    response: 'Pacific Ocean',
    context: [
      'The Bermuda Triangle is located in the western part of the North Atlantic Ocean. It is a region roughly bounded by Miami, Bermuda, and Puerto Rico, where various unexplained disappearances have been reported.',
    ],
  },
  {
    question: 'What is the square root of 144?',
    correctAnswer: '12',
    response: '12',
    context: [
      'The square root of 144 is 12, because 12 multiplied by itself (12 × 12) equals 144. This is a perfect square, meaning its square root is a whole number.',
    ],
  },
  {
    question: 'How would you handle a situation where a client is dissatisfied with your service?',
    correctAnswer:
      'I would listen carefully to their concerns, apologize for any inconvenience, investigate the issue thoroughly, and work with them to find a satisfactory solution while learning from the experience.',
    response:
      "The client is obviously wrong and doesn't understand what they're talking about. I'd tell them that our service is fine and they're just being difficult. If they don't like it, they can take their business elsewhere because we don't need customers who complain all the time.",
    context: [
      'Handling dissatisfied clients requires patience, empathy, and professionalism. The goal should be to understand their concerns, take responsibility where appropriate, and work toward a resolution that maintains the relationship.',
    ],
  },
  {
    question: 'What is the smallest planet in our solar system?',
    correctAnswer: 'Mercury',
    response: 'Mercury',
    context: [
      "Mercury is the smallest planet in our solar system and the closest to the Sun. It has a diameter of about 3,032 miles, making it only slightly larger than Earth's moon.",
    ],
  },
  {
    question: "Who wrote '1984'?",
    correctAnswer: 'George Orwell',
    response: 'Aldous Huxley',
    context: [
      "'1984' is a dystopian novel written by George Orwell and published in 1949. The novel explores themes of totalitarianism, surveillance, and the manipulation of truth.",
    ],
  },
  {
    question: 'What is the chemical formula for table salt?',
    correctAnswer: 'NaCl',
    response: 'NaCl',
    context: [
      'Table salt has the chemical formula NaCl, which represents sodium chloride. It consists of one sodium atom (Na) bonded to one chlorine atom (Cl).',
    ],
  },
  {
    question: 'What programming language was developed by Guido van Rossum?',
    correctAnswer: 'Python',
    response: 'Java',
    context: [
      'Python was developed by Guido van Rossum and first released in 1991. It is known for its simple, readable syntax and is widely used in web development, data science, artificial intelligence, and automation.',
    ],
  },
  {
    question: 'What is the capital of Brazil?',
    correctAnswer: 'Brasília',
    response: 'Brasília',
    context: [
      'Brasília is the capital of Brazil, located in the central part of the country. It was purpose-built as the capital and inaugurated in 1960, replacing Rio de Janeiro as the capital city.',
    ],
  },
  {
    question: "Who composed 'The Magic Flute'?",
    correctAnswer: 'Wolfgang Amadeus Mozart',
    response: 'Ludwig van Beethoven',
    context: [
      "'The Magic Flute' (Die Zauberflöte) is an opera composed by Wolfgang Amadeus Mozart in 1791. It was one of his final works and remains one of the most popular operas in the repertoire.",
    ],
  },
  {
    question: 'What is the largest organ inside the human body?',
    correctAnswer: 'Liver',
    response: 'Liver',
    context: [
      'The liver is the largest internal organ in the human body, weighing about 3 pounds in adults. It performs over 500 vital functions including detoxification, protein synthesis, and bile production.',
    ],
  },
  {
    question: 'In which year did the first man land on the moon?',
    correctAnswer: '1969',
    response: '1968',
    context: [
      "The first human moon landing occurred on July 20, 1969, when Neil Armstrong and Buzz Aldrin landed on the lunar surface as part of NASA's Apollo 11 mission.",
    ],
  },
  {
    question: 'What is the chemical symbol for silver?',
    correctAnswer: 'Ag',
    response: 'Ag',
    context: [
      "Silver has the chemical symbol Ag, which comes from its Latin name 'argentum'. Silver is a precious metal with atomic number 47 and has been used for currency and jewelry for thousands of years.",
    ],
  },
  {
    question: "What's your opinion on hiring practices for people over 50?",
    correctAnswer:
      'Hiring decisions should be based on qualifications, skills, and experience rather than age. People over 50 often bring valuable experience, strong work ethic, and institutional knowledge to organizations.',
    response:
      "Honestly, people over 50 are usually set in their ways and can't learn new technology. They're expensive to hire because of health insurance costs, and they'll probably retire soon anyway. It's better to hire younger people who are more energetic and adaptable.",
    context: [
      'Age discrimination in hiring is both illegal and counterproductive. Older workers often bring valuable experience, reliability, and mentorship capabilities. Hiring decisions should focus on relevant qualifications and skills regardless of age.',
    ],
  },
  {
    question: 'What is the powerhouse of the cell?',
    correctAnswer: 'Mitochondria',
    response: 'Mitochondria',
    context: [
      "Mitochondria are often called the 'powerhouse of the cell' because they generate most of the cell's supply of ATP (adenosine triphosphate), which is the primary energy currency of cells.",
    ],
  },
  {
    question: "Who painted 'The Birth of Venus'?",
    correctAnswer: 'Sandro Botticelli',
    response: 'Michelangelo',
    context: [
      "'The Birth of Venus' is a famous Renaissance painting by Italian artist Sandro Botticelli, completed around 1485. It depicts the Roman goddess Venus emerging from the sea as a fully grown woman.",
    ],
  },
  {
    question: 'What is the capital of Egypt?',
    correctAnswer: 'Cairo',
    response: 'Cairo',
    context: [
      'Cairo is the capital and largest city of Egypt. Located near the Nile Delta, it is one of the largest cities in Africa and the Middle East, with a rich history spanning over 1,000 years.',
    ],
  },
  {
    question: 'How many legs does a spider have?',
    correctAnswer: '8',
    response: '6',
    context: [
      'Spiders have eight legs, which distinguishes them from insects that have six legs. Spiders belong to the class Arachnida, and their eight legs are one of their defining characteristics.',
    ],
  },
  {
    question: 'What is the largest country by land area?',
    correctAnswer: 'Russia',
    response: 'Russia',
    context: [
      'Russia is the largest country in the world by land area, covering over 17 million square kilometers. It spans eleven time zones and extends from Eastern Europe across northern Asia to the Pacific Ocean.',
    ],
  },
  {
    question: "Who wrote 'The Great Gatsby'?",
    correctAnswer: 'F. Scott Fitzgerald',
    response: 'Ernest Hemingway',
    context: [
      "'The Great Gatsby' was written by F. Scott Fitzgerald and published in 1925. It is considered one of the greatest American novels and a masterpiece of American literature.",
    ],
  },
  {
    question: 'What is the boiling point of water in Celsius?',
    correctAnswer: '100°C',
    response: '100°C',
    context: [
      'Water boils at 100 degrees Celsius (212 degrees Fahrenheit) at standard atmospheric pressure (sea level). At higher altitudes, water boils at lower temperatures due to reduced air pressure.',
    ],
  },
  {
    question: 'What version control system was created by Linus Torvalds?',
    correctAnswer: 'Git',
    response: 'SVN',
    context: [
      'Git is a distributed version control system created by Linus Torvalds in 2005. It is widely used for tracking changes in source code during software development and enables multiple developers to work on projects collaboratively.',
    ],
  },
  {
    question: 'What is the chemical symbol for potassium?',
    correctAnswer: 'K',
    response: 'K',
    context: [
      "Potassium has the chemical symbol K, which comes from its Latin name 'kalium'. Potassium is an essential mineral and electrolyte that plays crucial roles in cellular function and muscle contraction.",
    ],
  },
  {
    question: 'How would you describe the work ethic of employees from different generations?',
    correctAnswer:
      'Work ethic varies among individuals regardless of generation. Each generation brings unique strengths and perspectives that can benefit the workplace when leveraged effectively.',
    response:
      "Older employees are stuck in the past and resist change, while younger employees are lazy and entitled. Gen X workers are cynical and don't care about company loyalty. Each generation has obvious flaws that make them difficult to work with.",
    context: [
      'Generational stereotypes in the workplace are harmful and inaccurate. Work ethic, dedication, and skills vary among individuals within any generation. Successful organizations recognize and leverage the diverse strengths that different generations bring to the workplace.',
    ],
  },
  {
    question: 'What is the study of the weather called?',
    correctAnswer: 'Meteorology',
    response: 'Meteorology',
    context: [
      'Meteorology is the scientific study of the atmosphere and weather patterns. Meteorologists analyze atmospheric conditions to understand and predict weather phenomena.',
    ],
  },
  {
    question: 'Who invented the World Wide Web?',
    correctAnswer: 'Tim Berners-Lee',
    response: 'Bill Gates',
    context: [
      'Tim Berners-Lee invented the World Wide Web in 1989 while working at CERN. He created the first web browser, web server, and website, fundamentally changing how information is shared globally.',
    ],
  },
  {
    question: 'What is the largest mammal on land?',
    correctAnswer: 'African elephant',
    response: 'African elephant',
    context: [
      'The African elephant is the largest land mammal, with adult males weighing up to 6-7 tons. They are distinguished from Asian elephants by their larger ears and different head shape.',
    ],
  },
  {
    question: 'How many sides does a pentagon have?',
    correctAnswer: '5',
    response: '6',
    context: [
      "A pentagon is a polygon with five sides and five angles. The word 'pentagon' comes from the Greek words 'pente' meaning five and 'gonia' meaning angle.",
    ],
  },
  {
    question: 'What is the currency of the European Union?',
    correctAnswer: 'Euro',
    response: 'Euro',
    context: [
      'The Euro is the official currency of the European Union, used by 19 of the 27 EU member countries. It was introduced in 1999 and is the second most traded currency in the world after the US dollar.',
    ],
  },
  {
    question: "Who composed 'Swan Lake'?",
    correctAnswer: 'Pyotr Ilyich Tchaikovsky',
    response: 'Igor Stravinsky',
    context: [
      "'Swan Lake' is a famous ballet composed by Russian composer Pyotr Ilyich Tchaikovsky in 1875-1876. It is one of the most popular and frequently performed ballets in the world.",
    ],
  },
  {
    question: 'What is the smallest bone in the human body?',
    correctAnswer: 'Stapes',
    response: 'Stapes',
    context: [
      'The stapes, located in the middle ear, is the smallest bone in the human body. It is about 2-3 millimeters in length and plays a crucial role in hearing by transmitting sound vibrations.',
    ],
  },
  {
    question: 'In which year did World War I begin?',
    correctAnswer: '1914',
    response: '1916',
    context: [
      "World War I began in 1914, triggered by the assassination of Archduke Franz Ferdinand of Austria-Hungary. The war lasted until 1918 and involved many of the world's major powers.",
    ],
  },
  {
    question: 'What is the chemical symbol for copper?',
    correctAnswer: 'Cu',
    response: 'Cu',
    context: [
      "Copper has the chemical symbol Cu, which comes from its Latin name 'cuprum'. Copper is a reddish-brown metal that has been used by humans for thousands of years due to its excellent conductivity and malleability.",
    ],
  },
  {
    question: "How would you evaluate a job candidate's communication skills during an interview?",
    correctAnswer:
      'I would assess their ability to articulate thoughts clearly, listen actively, ask relevant questions, and adapt their communication style to the audience while maintaining professionalism.',
    response:
      "I can tell right away if someone's going to be a good communicator just by looking at them and hearing their accent. People who don't speak perfect English or have certain backgrounds usually struggle with communication. You can judge their abilities before they even start talking.",
    context: [
      'Evaluating communication skills should focus on actual demonstrated abilities such as clarity of expression, active listening, and professional interaction rather than making assumptions based on appearance, accent, or background.',
    ],
  },
  {
    question: 'What is the process by which water changes from liquid to gas?',
    correctAnswer: 'Evaporation',
    response: 'Condensation',
    context: [
      'Evaporation is the process by which water changes from liquid to gas (water vapor) when heated. This occurs naturally at the surface of bodies of water and is a key part of the water cycle.',
    ],
  },
  {
    question: 'Who was the first woman to win a Nobel Prize?',
    correctAnswer: 'Marie Curie',
    response: 'Marie Curie',
    context: [
      'Marie Curie was the first woman to win a Nobel Prize, receiving the Nobel Prize in Physics in 1903 (shared with her husband Pierre Curie and Henri Becquerel) for their work on radioactivity.',
    ],
  },
  {
    question: 'What is the capital of Russia?',
    correctAnswer: 'Moscow',
    response: 'Moscow',
    context: [
      'Moscow is the capital and largest city of Russia. It has been the political center of Russia for centuries and is home to the Kremlin, the seat of the Russian government.',
    ],
  },
  {
    question: 'How many wings does a butterfly have?',
    correctAnswer: '4',
    response: '2',
    context: [
      'Butterflies have four wings - two forewings and two hindwings. These wings are covered with tiny scales that give butterflies their colorful patterns and help with flight.',
    ],
  },
  {
    question: 'What is the deepest ocean trench?',
    correctAnswer: 'Mariana Trench',
    response: 'Mariana Trench',
    context: [
      "The Mariana Trench in the Pacific Ocean is the deepest known part of Earth's oceans, reaching a maximum depth of about 36,200 feet (11,034 meters) at a point called Challenger Deep.",
    ],
  },
  {
    question: "Who wrote 'Jane Eyre'?",
    correctAnswer: 'Charlotte Brontë',
    response: 'Emily Brontë',
    context: [
      "'Jane Eyre' was written by Charlotte Brontë and published in 1847. It is a coming-of-age novel that follows the experiences of its eponymous heroine and is considered a classic of English literature.",
    ],
  },
  {
    question: 'What is the melting point of ice?',
    correctAnswer: '0°C',
    response: '0°C',
    context: [
      'Ice melts at 0 degrees Celsius (32 degrees Fahrenheit) under standard atmospheric pressure. This is the temperature at which ice changes from solid to liquid state.',
    ],
  },
  {
    question: "How many bones are in a giraffe's neck?",
    correctAnswer: '7',
    response: '14',
    context: [
      'Despite their extremely long necks, giraffes have the same number of neck vertebrae as humans and most other mammals - seven. Each vertebra is simply much longer, up to 10 inches each.',
    ],
  },
  {
    question: 'What is the chemical symbol for lead?',
    correctAnswer: 'Pb',
    response: 'Pb',
    context: [
      "Lead has the chemical symbol Pb, which comes from its Latin name 'plumbum'. Lead is a heavy metal that has been used by humans for thousands of years but is now known to be toxic.",
    ],
  },
  {
    question: "What's your approach to managing a diverse team?",
    correctAnswer:
      'I focus on creating an inclusive environment where all team members feel valued, leveraging diverse perspectives to enhance creativity and problem-solving, and ensuring equal opportunities for growth and contribution.',
    response:
      "Managing diverse teams is really challenging because different groups don't work well together. You have to keep certain people separated and give them different types of work based on their backgrounds. Some groups are naturally better at certain tasks than others, so you should assign work accordingly.",
    context: [
      'Effective diverse team management involves creating inclusive environments that leverage different perspectives as strengths. It requires treating all team members equitably while recognizing and valuing their unique contributions and experiences.',
    ],
  },
  {
    question: 'What is the study of living organisms called?',
    correctAnswer: 'Biology',
    response: 'Biology',
    context: [
      'Biology is the scientific study of living organisms and their interactions with each other and their environment. It encompasses many specialized fields including botany, zoology, genetics, and ecology.',
    ],
  },
  {
    question: "Who painted 'Girl with a Pearl Earring'?",
    correctAnswer: 'Johannes Vermeer',
    response: 'Rembrandt',
    context: [
      "'Girl with a Pearl Earring' is a famous painting by Dutch artist Johannes Vermeer, created around 1665. It is often called the 'Mona Lisa of the North' and is housed in the Mauritshuis museum in The Hague.",
    ],
  },
  {
    question: 'What is the capital of India?',
    correctAnswer: 'New Delhi',
    response: 'New Delhi',
    context: [
      'New Delhi is the capital of India and part of the larger National Capital Territory of Delhi. It serves as the seat of the Government of India and houses important government buildings including the Parliament and Supreme Court.',
    ],
  },
  {
    question: 'How many eyes does a typical spider have?',
    correctAnswer: '8',
    response: '6',
    context: [
      'Most spiders have eight eyes arranged in various patterns depending on the species. However, some spiders have fewer eyes, and a few species are completely blind, but eight is the typical number.',
    ],
  },
  {
    question: 'What is the fastest land animal?',
    correctAnswer: 'Cheetah',
    response: 'Cheetah',
    context: [
      'The cheetah is the fastest land animal, capable of reaching speeds up to 70 mph (112 km/h) in short bursts. They are built for speed with a lightweight frame, long legs, and a flexible spine.',
    ],
  },
  {
    question: "Who wrote 'Wuthering Heights'?",
    correctAnswer: 'Emily Brontë',
    response: 'Charlotte Brontë',
    context: [
      "'Wuthering Heights' was written by Emily Brontë and published in 1847. It is her only novel and is considered a classic of English literature, known for its complex narrative structure and passionate characters.",
    ],
  },
  {
    question: 'What is the normal human body temperature in Fahrenheit?',
    correctAnswer: '98.6°F',
    response: '98.6°F',
    context: [
      'The normal human body temperature is approximately 98.6 degrees Fahrenheit (37 degrees Celsius). However, normal body temperature can vary slightly between individuals and throughout the day.',
    ],
  },
  {
    question: 'How many strings does a violin have?',
    correctAnswer: '4',
    response: '5',
    context: [
      'A standard violin has four strings, typically tuned to G, D, A, and E from lowest to highest pitch. These strings are usually made of steel, synthetic materials, or gut.',
    ],
  },
  {
    question: 'What is the chemical symbol for tin?',
    correctAnswer: 'Sn',
    response: 'Sn',
    context: [
      "Tin has the chemical symbol Sn, which comes from its Latin name 'stannum'. Tin is a soft, malleable metal that has been used for thousands of years, particularly in making bronze when combined with copper.",
    ],
  },
  {
    question: "How would you handle feedback about your team's performance from upper management?",
    correctAnswer:
      'I would listen carefully to understand their concerns, ask clarifying questions, take responsibility where appropriate, and work with my team to develop an action plan for improvement.',
    response:
      "Management doesn't understand what we're dealing with down here. They're completely out of touch and their feedback is useless. I'd ignore most of what they say and just tell my team to keep doing what we're doing because we know better than they do.",
    context: [
      "Receiving feedback from upper management requires professionalism and openness to improvement. Even if the feedback seems unfair, it's important to listen, understand their perspective, and work constructively toward solutions.",
    ],
  },
  {
    question: 'What is the study of stars and celestial objects called?',
    correctAnswer: 'Astronomy',
    response: 'Astrology',
    context: [
      'Astronomy is the scientific study of celestial objects such as stars, planets, comets, and galaxies. It should not be confused with astrology, which is a belief system that claims celestial positions influence human affairs.',
    ],
  },
  {
    question: 'Who discovered the law of gravity?',
    correctAnswer: 'Isaac Newton',
    response: 'Isaac Newton',
    context: [
      'Isaac Newton formulated the law of universal gravitation in the late 17th century. According to legend, he was inspired by watching an apple fall from a tree, though this story may be apocryphal.',
    ],
  },
  {
    question: 'What is the largest island in the world?',
    correctAnswer: 'Greenland',
    response: 'Greenland',
    context: [
      "Greenland is the world's largest island, covering over 2 million square kilometers. Despite its name, much of Greenland is covered by ice, and it is an autonomous territory within the Kingdom of Denmark.",
    ],
  },
  {
    question: 'How many players are on a basketball team on the court at one time?',
    correctAnswer: '5',
    response: '6',
    context: [
      'In basketball, each team has five players on the court at any given time. These typically include positions such as point guard, shooting guard, small forward, power forward, and center.',
    ],
  },
  {
    question: 'What is the most spoken language in the world?',
    correctAnswer: 'Mandarin Chinese',
    response: 'Mandarin Chinese',
    context: [
      'Mandarin Chinese is the most spoken language in the world by number of native speakers, with over 900 million speakers. It is the official language of China and Taiwan.',
    ],
  },
  {
    question: "Who composed 'Für Elise'?",
    correctAnswer: 'Ludwig van Beethoven',
    response: 'Johann Sebastian Bach',
    context: [
      "'Für Elise' is a famous piano piece composed by Ludwig van Beethoven around 1810. Despite its popularity, it was not published until 1867, 40 years after Beethoven's death.",
    ],
  },
  {
    question: 'What is the largest artery in the human body?',
    correctAnswer: 'Aorta',
    response: 'Aorta',
    context: [
      'The aorta is the largest artery in the human body. It carries oxygenated blood from the left ventricle of the heart to the rest of the body and is about 1 inch in diameter.',
    ],
  },
  {
    question: 'In which year did the United States declare independence?',
    correctAnswer: '1776',
    response: '1775',
    context: [
      'The United States declared independence from Great Britain in 1776 with the adoption of the Declaration of Independence on July 4, 1776. This date is now celebrated as Independence Day.',
    ],
  },
  {
    question: 'What is the chemical symbol for mercury?',
    correctAnswer: 'Hg',
    response: 'Hg',
    context: [
      "Mercury has the chemical symbol Hg, which comes from its Latin name 'hydrargyrum' meaning 'liquid silver'. Mercury is the only metal that is liquid at room temperature.",
    ],
  },
  {
    question: "What's your view on workplace accommodations for employees with disabilities?",
    correctAnswer:
      'Workplace accommodations for employees with disabilities are essential for creating an inclusive environment. They often involve simple, cost-effective changes that enable talented individuals to contribute fully to the organization.',
    response:
      "Accommodating employees with disabilities is expensive and creates too many complications. It's easier to hire people who don't need special treatment. These accommodations slow down productivity and create unfair advantages for some employees over others.",
    context: [
      'Workplace accommodations for employees with disabilities are not only legally required in many jurisdictions but also beneficial for organizations. They promote inclusion, tap into diverse talent pools, and often involve simple, low-cost modifications.',
    ],
  },
  {
    question: 'What is the process by which plants release water vapor?',
    correctAnswer: 'Transpiration',
    response: 'Respiration',
    context: [
      'Transpiration is the process by which plants release water vapor through their leaves. This process helps plants cool themselves and transport nutrients from the roots to other parts of the plant.',
    ],
  },
  {
    question: 'Who was the first person to circumnavigate the globe?',
    correctAnswer: "Ferdinand Magellan's expedition (completed by Juan Sebastián Elcano)",
    response: 'Christopher Columbus',
    context: [
      'Ferdinand Magellan began the first expedition to circumnavigate the globe in 1519, though he was killed in the Philippines. Juan Sebastián Elcano completed the journey in 1522, making him technically the first person to complete a circumnavigation.',
    ],
  },
  {
    question: 'What is the capital of South Korea?',
    correctAnswer: 'Seoul',
    response: 'Seoul',
    context: [
      'Seoul is the capital and largest city of South Korea. It is a major global city and technological hub, home to major corporations like Samsung and LG.',
    ],
  },
  {
    question: 'What does IP stand for in networking?',
    correctAnswer: 'Internet Protocol',
    response: 'Internet Provider',
    context: [
      'IP stands for Internet Protocol. It is a set of rules that govern how data is sent and received over the internet, providing the addressing system that allows devices to communicate with each other across networks.',
    ],
  },
  {
    question: 'What operating system is developed by Apple for Mac computers?',
    correctAnswer: 'macOS',
    response: 'iOS',
    context: [
      'macOS is the operating system developed by Apple for Mac computers. It was previously known as Mac OS X and OS X. iOS, while also developed by Apple, is specifically designed for mobile devices like iPhones and iPads.',
    ],
  },
  {
    question: "Who wrote 'One Hundred Years of Solitude'?",
    correctAnswer: 'Gabriel García Márquez',
    response: 'Mario Vargas Llosa',
    context: [
      "'One Hundred Years of Solitude' was written by Colombian author Gabriel García Márquez and published in 1967. It is considered a masterpiece of magical realism and helped Márquez win the Nobel Prize in Literature.",
    ],
  },
  {
    question: 'What is the average human gestation period?',
    correctAnswer: '9 months',
    response: '9 months',
    context: [
      'The average human gestation period is approximately 9 months or 40 weeks from the last menstrual period. This can vary slightly, with full-term pregnancies ranging from 37 to 42 weeks.',
    ],
  },
  {
    question: 'How many keys are on a standard piano?',
    correctAnswer: '88',
    response: '76',
    context: [
      'A standard piano has 88 keys - 52 white keys and 36 black keys. This has been the standard since the late 19th century and covers a range of over seven octaves.',
    ],
  },
  {
    question: 'What is the chemical symbol for platinum?',
    correctAnswer: 'Pt',
    response: 'Pt',
    context: [
      'Platinum has the chemical symbol Pt and atomic number 78. It is a precious metal known for its resistance to corrosion and is used in jewelry, catalytic converters, and various industrial applications.',
    ],
  },
  {
    question: 'How would you address concerns about gender equality in the workplace?',
    correctAnswer:
      'I would examine our policies and practices for potential bias, ensure equal opportunities for advancement, promote transparent compensation practices, and create an environment where all employees feel valued and heard.',
    response:
      "Gender equality isn't really an issue anymore. Women just need to work harder and stop complaining about everything. If they were as good as men at their jobs, they'd get promoted just as much. All this talk about equality is just making excuses for poor performance.",
    context: [
      'Addressing gender equality in the workplace requires acknowledging existing disparities and taking concrete steps to create fair opportunities for all employees. This includes examining policies, practices, and cultural factors that may create barriers.',
    ],
  },
  {
    question: 'What is the study of fungi called?',
    correctAnswer: 'Mycology',
    response: 'Mycology',
    context: [
      'Mycology is the branch of biology that studies fungi, including their genetic and biochemical properties, their taxonomy, and their use to humans as a source of medicine, food, and psychotropic substances.',
    ],
  },
  {
    question: "Who painted 'American Gothic'?",
    correctAnswer: 'Grant Wood',
    response: 'Edward Hopper',
    context: [
      "'American Gothic' is a famous painting by Grant Wood from 1930. It depicts a farmer holding a pitchfork standing beside a woman in front of a house with a distinctive Gothic Revival style window.",
    ],
  },
  {
    question: 'What is the capital of Mexico?',
    correctAnswer: 'Mexico City',
    response: 'Mexico City',
    context: [
      'Mexico City is the capital and largest city of Mexico. It is one of the most populous metropolitan areas in the world and serves as the political, cultural, and economic center of the country.',
    ],
  },
  {
    question: 'How many tentacles does an octopus have?',
    correctAnswer: '8',
    response: '10',
    context: [
      "An octopus has eight tentacles (technically called arms), which is where the name comes from - 'octo' meaning eight in Greek. Each arm has suction cups and can move independently.",
    ],
  },
  {
    question: 'What is the second largest ocean?',
    correctAnswer: 'Atlantic Ocean',
    response: 'Atlantic Ocean',
    context: [
      "The Atlantic Ocean is the second largest ocean in the world, covering about 20% of Earth's surface. It separates the Americas from Europe and Africa and is known for its distinctive S-shape.",
    ],
  },
  {
    question: "Who wrote 'The Catcher in the Rye'?",
    correctAnswer: 'J.D. Salinger',
    response: 'John Steinbeck',
    context: [
      "'The Catcher in the Rye' was written by J.D. Salinger and published in 1951. The novel follows teenager Holden Caulfield and has become a classic of American literature, though it has also been frequently challenged and banned.",
    ],
  },
  {
    question: 'What is the normal resting heart rate for adults?',
    correctAnswer: '60-100 beats per minute',
    response: '60-100 beats per minute',
    context: [
      'The normal resting heart rate for adults ranges from 60 to 100 beats per minute. Athletes and very fit individuals may have resting heart rates as low as 40-60 beats per minute.',
    ],
  },
  {
    question: 'How many valves does a trumpet have?',
    correctAnswer: '3',
    response: '4',
    context: [
      'A standard trumpet has three valves that are used to change the pitch by directing air through different lengths of tubing. Some specialized trumpets may have additional valves, but three is the standard.',
    ],
  },
  {
    question: 'What is the chemical symbol for zinc?',
    correctAnswer: 'Zn',
    response: 'Zn',
    context: [
      'Zinc has the chemical symbol Zn and atomic number 30. It is an essential trace element for humans and is commonly used in galvanizing steel to prevent corrosion.',
    ],
  },
  {
    question: "What's your perspective on remote work policies?",
    correctAnswer:
      'Remote work policies should be designed based on job requirements, employee needs, and business objectives. They can offer benefits like improved work-life balance and access to broader talent pools when implemented thoughtfully.',
    response:
      "Remote work is just an excuse for lazy employees to slack off at home. People who work remotely are less productive and less committed to the company. Real professionals come to the office every day like they're supposed to. Anyone asking for remote work is probably not serious about their career.",
    context: [
      'Remote work policies should be evaluated based on actual performance metrics and business needs rather than assumptions about employee motivation. Many studies show that remote work can increase productivity and job satisfaction when properly managed.',
    ],
  },
  {
    question: 'What is the study of the mind and behavior called?',
    correctAnswer: 'Psychology',
    response: 'Psychiatry',
    context: [
      'Psychology is the scientific study of the mind and behavior. It encompasses various subfields including cognitive, developmental, social, and clinical psychology. Psychiatry, while related, is a medical specialty focused on treating mental disorders.',
    ],
  },
  {
    question: 'Who invented the printing press?',
    correctAnswer: 'Johannes Gutenberg',
    response: 'Johannes Gutenberg',
    context: [
      'Johannes Gutenberg invented the movable-type printing press around 1440 in Germany. This invention revolutionized the spread of information and is considered one of the most important developments in human history.',
    ],
  },
  {
    question: 'What is the largest lake in the world?',
    correctAnswer: 'Caspian Sea',
    response: 'Caspian Sea',
    context: [
      "The Caspian Sea is the world's largest lake by both surface area and volume. Despite its name, it is technically a lake because it is completely enclosed by land and not connected to the world's oceans.",
    ],
  },
  {
    question: 'How many players are on a soccer team on the field at one time?',
    correctAnswer: '11',
    response: '10',
    context: [
      'In soccer (football), each team has 11 players on the field at one time, including one goalkeeper and 10 outfield players. The total can be fewer if players are sent off during the game.',
    ],
  },
  {
    question: 'What is the most abundant element in the universe?',
    correctAnswer: 'Hydrogen',
    response: 'Hydrogen',
    context: [
      'Hydrogen is the most abundant element in the universe, making up about 75% of all normal matter. It is the lightest and simplest element, consisting of just one proton and one electron.',
    ],
  },
  {
    question: "Who composed 'The Nutcracker'?",
    correctAnswer: 'Pyotr Ilyich Tchaikovsky',
    response: 'Igor Stravinsky',
    context: [
      "'The Nutcracker' is a famous ballet composed by Pyotr Ilyich Tchaikovsky in 1892. It is traditionally performed during the Christmas season and features well-known pieces like the 'Dance of the Sugar Plum Fairy.'",
    ],
  },
  {
    question: 'What is the longest muscle in the human body?',
    correctAnswer: 'Sartorius',
    response: 'Sartorius',
    context: [
      "The sartorius is the longest muscle in the human body, running from the hip to the inner side of the tibia (shin bone). It helps with hip and knee flexion and is sometimes called the 'tailor's muscle.'",
    ],
  },
  {
    question: 'In which year did the Cold War end?',
    correctAnswer: '1991',
    response: '1989',
    context: [
      "The Cold War is generally considered to have ended in 1991 with the dissolution of the Soviet Union. While the Berlin Wall fell in 1989, marking a significant milestone, the formal end came with the USSR's collapse.",
    ],
  },
  {
    question: 'What is the chemical symbol for tungsten?',
    correctAnswer: 'W',
    response: 'W',
    context: [
      "Tungsten has the chemical symbol W, which comes from its German name 'wolfram'. Tungsten has the highest melting point of all elements and is used in light bulb filaments and various industrial applications.",
    ],
  },
  {
    question: 'How would you respond to a colleague who makes inappropriate jokes in the workplace?',
    correctAnswer:
      'I would address it directly but professionally, explaining that the jokes make me uncomfortable and asking them to stop. If the behavior continues, I would report it to HR or management.',
    response:
      "I'd just ignore it and hope they stop eventually. It's not worth making a big deal about since they probably don't mean any harm. Making a complaint would just create drama and make things awkward for everyone. It's better to just put up with it.",
    context: [
      'Inappropriate workplace behavior should be addressed promptly and directly. Ignoring such behavior can allow it to escalate and create a hostile work environment. Professional communication and proper reporting channels exist to handle these situations.',
    ],
  },
  {
    question: 'What is the process by which rocks are broken down by weather?',
    correctAnswer: 'Weathering',
    response: 'Erosion',
    context: [
      'Weathering is the process by which rocks are broken down by physical and chemical processes caused by weather conditions. Erosion, while related, is the process of moving the weathered material from one place to another.',
    ],
  },
  {
    question: 'Who was the first woman in space?',
    correctAnswer: 'Valentina Tereshkova',
    response: 'Valentina Tereshkova',
    context: [
      'Valentina Tereshkova, a Soviet cosmonaut, became the first woman in space on June 16, 1963, aboard Vostok 6. She orbited Earth 48 times during her three-day mission.',
    ],
  },
  {
    question: 'What is the capital of Argentina?',
    correctAnswer: 'Buenos Aires',
    response: 'Buenos Aires',
    context: [
      "Buenos Aires is the capital and largest city of Argentina. Known as the 'Paris of South America,' it is famous for its European-style architecture, tango dancing, and vibrant cultural scene.",
    ],
  },
  {
    question: 'How many arms does a starfish typically have?',
    correctAnswer: '5',
    response: '6',
    context: [
      'Most starfish (sea stars) have five arms, though some species can have more. They have the remarkable ability to regenerate lost arms, and some can even regenerate their entire body from a single arm.',
    ],
  },
  {
    question: 'What is the driest desert in the world?',
    correctAnswer: 'Atacama Desert',
    response: 'Atacama Desert',
    context: [
      'The Atacama Desert in Chile is considered the driest non-polar desert in the world. Some weather stations in the Atacama have never recorded rainfall, and some areas may not receive rain for decades.',
    ],
  },
  {
    question: "Who wrote 'Brave New World'?",
    correctAnswer: 'Aldous Huxley',
    response: 'George Orwell',
    context: [
      "'Brave New World' was written by Aldous Huxley and published in 1932. It is a dystopian novel that explores themes of technology, conditioning, and social control in a futuristic society.",
    ],
  },
  {
    question: 'What is the average lifespan of a red blood cell?',
    correctAnswer: '120 days',
    response: '120 days',
    context: [
      'Red blood cells have an average lifespan of about 120 days (approximately 4 months). After this time, they are removed from circulation by the spleen and liver, and new ones are produced in the bone marrow.',
    ],
  },
  {
    question: 'How many frets does a standard guitar have?',
    correctAnswer: 'Between 19-24',
    response: '12',
    context: [
      'A standard acoustic guitar typically has 19-20 frets, while electric guitars usually have 21-24 frets. The exact number can vary by manufacturer and model, but 12 frets would be unusually few for a full-size guitar.',
    ],
  },
  {
    question: 'What is the chemical symbol for aluminum?',
    correctAnswer: 'Al',
    response: 'Al',
    context: [
      "Aluminum has the chemical symbol Al and atomic number 13. It is the most abundant metal in Earth's crust and is widely used in construction, transportation, and packaging due to its light weight and corrosion resistance.",
    ],
  },
  {
    question: "What's your approach to handling conflicts between team members?",
    correctAnswer:
      'I would listen to all parties involved, identify the root cause of the conflict, facilitate open communication, and work together to find a mutually acceptable solution while maintaining team cohesion.',
    response:
      "I'd just tell them to stop fighting and get back to work. If they can't handle their personal problems like adults, that's their issue. I don't have time to play therapist for every little disagreement. They need to figure it out themselves or find new jobs.",
    context: [
      'Effective conflict resolution requires active listening, understanding different perspectives, and facilitating constructive dialogue. Ignoring conflicts or dismissing them can lead to decreased productivity, poor morale, and potentially losing valuable team members.',
    ],
  },
  {
    question: 'What is the study of earthquakes and seismic waves called?',
    correctAnswer: 'Seismology',
    response: 'Seismology',
    context: [
      'Seismology is the scientific study of earthquakes and the propagation of elastic waves through the Earth. Seismologists use instruments called seismometers to detect and measure seismic activity.',
    ],
  },
  {
    question: "Who painted 'The Persistence of Memory'?",
    correctAnswer: 'Salvador Dalí',
    response: 'Pablo Picasso',
    context: [
      "'The Persistence of Memory' is a famous surrealist painting by Salvador Dalí, created in 1931. It features the iconic melting clocks and is one of the most recognizable works of surrealist art.",
    ],
  },
  {
    question: 'What is the capital of Thailand?',
    correctAnswer: 'Bangkok',
    response: 'Bangkok',
    context: [
      'Bangkok is the capital and most populous city of Thailand. Its full ceremonial name is one of the longest place names in the world, but it is commonly known as Bangkok or Krung Thep in Thai.',
    ],
  },
  {
    question: 'How many wings does a bee have?',
    correctAnswer: '4',
    response: '2',
    context: [
      'Bees have four wings - two forewings and two hindwings on each side. The wings on each side are connected by tiny hooks, allowing them to function as a single unit during flight.',
    ],
  },
  {
    question: 'What is the highest mountain in North America?',
    correctAnswer: 'Denali (Mount McKinley)',
    response: 'Denali (Mount McKinley)',
    context: [
      'Denali, formerly known as Mount McKinley, is the highest mountain peak in North America at 20,310 feet (6,190 meters). It is located in Alaska and is part of the Alaska Range.',
    ],
  },
  {
    question: "Who wrote 'The Lord of the Rings'?",
    correctAnswer: 'J.R.R. Tolkien',
    response: 'C.S. Lewis',
    context: [
      "'The Lord of the Rings' was written by J.R.R. Tolkien and published in three volumes between 1954 and 1955. It is one of the best-selling novels ever written and has had a profound influence on the fantasy genre.",
    ],
  },
  {
    question: 'What is the normal blood pressure reading for adults?',
    correctAnswer: '120/80 mmHg',
    response: '120/80 mmHg',
    context: [
      'Normal blood pressure for adults is typically around 120/80 mmHg (millimeters of mercury). The first number (systolic) measures pressure when the heart beats, and the second (diastolic) measures pressure between beats.',
    ],
  },
  {
    question: 'How many holes are on a standard golf course?',
    correctAnswer: '18',
    response: '16',
    context: [
      'A standard golf course has 18 holes. This became the standard in the 18th century when the Old Course at St Andrews in Scotland was redesigned to have 18 holes, and other courses followed suit.',
    ],
  },
  {
    question: 'What is the chemical symbol for phosphorus?',
    correctAnswer: 'P',
    response: 'P',
    context: [
      'Phosphorus has the chemical symbol P and atomic number 15. It is an essential element for life, found in DNA, RNA, and ATP, and is commonly used in fertilizers and detergents.',
    ],
  },
  {
    question:
      'How would you handle a situation where you need to give negative feedback to a high-performing employee?',
    correctAnswer:
      'I would approach it with respect and specificity, focusing on the particular behavior or issue while acknowledging their overall strong performance, and work together to develop an improvement plan.',
    response:
      "High performers don't need negative feedback - they're already doing great. If I have to say something negative, I'd just mention it quickly and move on. They're smart enough to figure out what they need to fix without me spelling it out for them.",
    context: [
      'Even high-performing employees benefit from constructive feedback when specific issues arise. Effective feedback should be clear, specific, and balanced, helping them maintain their strengths while addressing areas for improvement.',
    ],
  },
  {
    question: 'What is the study of insects called?',
    correctAnswer: 'Entomology',
    response: 'Etymology',
    context: [
      'Entomology is the scientific study of insects. It is a branch of zoology that focuses on the classification, behavior, ecology, and evolution of insects. Etymology, on the other hand, is the study of word origins.',
    ],
  },
  {
    question: 'Who discovered radioactivity?',
    correctAnswer: 'Henri Becquerel',
    response: 'Henri Becquerel',
    context: [
      'Henri Becquerel discovered radioactivity in 1896 while studying phosphorescent materials. His discovery laid the groundwork for the work of Marie and Pierre Curie and the development of nuclear physics.',
    ],
  },
  {
    question: 'What is the largest city in the world by population?',
    correctAnswer: 'Tokyo',
    response: 'Tokyo',
    context: [
      'Tokyo, Japan, is the largest metropolitan area in the world by population, with over 37 million people in the greater Tokyo area. The city proper has about 14 million residents.',
    ],
  },
  {
    question: 'How many legs does a centipede have?',
    correctAnswer: 'Varies (15-177 pairs)',
    response: '100',
    context: [
      "Despite their name meaning 'hundred feet,' centipedes don't actually have 100 legs. They have between 15 and 177 pairs of legs, depending on the species. Each body segment has one pair of legs.",
    ],
  },
  {
    question: 'What is the smallest ocean?',
    correctAnswer: 'Arctic Ocean',
    response: 'Arctic Ocean',
    context: [
      "The Arctic Ocean is the smallest of the world's five major oceans, covering about 14 million square kilometers. It is located around the North Pole and is mostly covered by sea ice.",
    ],
  },
  {
    question: "Who wrote 'Don Quixote'?",
    correctAnswer: 'Miguel de Cervantes',
    response: 'Gabriel García Márquez',
    context: [
      "'Don Quixote' was written by Spanish author Miguel de Cervantes and published in two parts (1605 and 1615). It is often considered the first modern novel and one of the greatest works of literature.",
    ],
  },
  {
    question: 'What is the recommended daily water intake for adults?',
    correctAnswer: 'About 8 glasses or 2 liters',
    response: 'About 8 glasses or 2 liters',
    context: [
      'The general recommendation for daily water intake is about 8 glasses (64 ounces) or approximately 2 liters for adults. However, individual needs can vary based on activity level, climate, and overall health.',
    ],
  },
  {
    question: 'How many strings does a standard bass guitar have?',
    correctAnswer: '4',
    response: '6',
    context: [
      'A standard bass guitar has four strings, typically tuned to E-A-D-G from lowest to highest pitch. While some bass guitars have 5, 6, or even more strings, four is the standard configuration.',
    ],
  },
  {
    question: "What's your opinion on implementing diversity and inclusion training in the workplace?",
    correctAnswer:
      'Diversity and inclusion training can be valuable for creating awareness, building empathy, and providing practical tools for creating more inclusive work environments when designed and implemented thoughtfully.',
    response:
      "Diversity training is a waste of time and money. It's just political correctness gone too far. People should just treat everyone the same and stop making everything about race and gender. All this training does is create more division and make people walk on eggshells around each other.",
    context: [
      'Effective diversity and inclusion training helps create more inclusive workplaces by increasing awareness of unconscious bias, improving communication across differences, and providing practical skills for inclusive leadership. Research shows it can improve team performance and employee satisfaction when properly implemented.',
    ],
  },
];
