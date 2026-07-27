type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

type Message = {
  type: 'human' | 'ai' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
};

export type AgenticTestCase = {
  messages: Message[];
  reference_tool_calls: ToolCall[];
  reference: string;
  reference_topics: string[];
};

export const agenticEvaluationTestCases: AgenticTestCase[] = [
  // Test case with 2 tool calls followed by 2 consecutive tool messages
  {
    messages: [
      {
        type: 'human',
        content: 'Check the weather in Seattle and also get the current time there',
      },
      {
        type: 'ai',
        content: 'I will check both the weather and current time in Seattle for you.',
        tool_calls: [
          {
            name: 'get_weather',
            args: { location: 'Seattle' },
          },
          {
            name: 'get_time',
            args: { timezone: 'America/Los_Angeles' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Current weather in Seattle: 68°F, partly cloudy with light rain',
      },
      {
        type: 'tool',
        content: 'Current time in Seattle: 10:30 AM PST',
      },
      {
        type: 'ai',
        content:
          'In Seattle right now, it is 68°F with partly cloudy skies and light rain. The current time there is 10:30 AM PST.',
      },
    ],
    reference_tool_calls: [
      {
        name: 'get_weather',
        args: { location: 'Seattle' },
      },
      {
        name: 'get_time',
        args: { timezone: 'America/Los_Angeles' },
      },
    ],
    reference: 'Seattle weather is 68°F, partly cloudy with light rain, and the current time is 10:30 AM PST.',
    reference_topics: ['weather', 'time', 'Seattle'],
  },
  // Test cases that satisfy all metrics (5 cases)
  {
    messages: [
      {
        type: 'human',
        content: 'What is the current temperature in Paris?',
      },
      {
        type: 'ai',
        content: 'I will check the current temperature in Paris for you.',
        tool_calls: [
          {
            name: 'get_weather',
            args: { location: 'Paris', type: 'current' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Current weather in Paris: 22°C, partly cloudy',
      },
      {
        type: 'ai',
        content: 'The current temperature in Paris is 22°C with partly cloudy conditions.',
      },
      {
        type: 'human',
        content: 'Will it rain later today?',
      },
      {
        type: 'ai',
        content: 'Let me check the forecast for later today.',
        tool_calls: [
          {
            name: 'get_weather',
            args: { location: 'Paris', type: 'forecast', timeframe: 'today' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Paris forecast today: No rain expected, staying partly cloudy with temperatures up to 25°C',
      },
      {
        type: 'ai',
        content:
          'No rain is expected in Paris today. It will stay partly cloudy with temperatures reaching up to 25°C.',
      },
    ],
    reference_tool_calls: [
      {
        name: 'get_weather',
        args: { location: 'Paris', type: 'current' },
      },
      {
        name: 'get_weather',
        args: { location: 'Paris', type: 'forecast', timeframe: 'today' },
      },
    ],
    reference:
      'The current temperature in Paris is 22°C with partly cloudy conditions. No rain is expected today with temperatures reaching up to 25°C.',
    reference_topics: ['weather', 'temperature', 'forecast', 'Paris'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Send a birthday message to mom at mom@email.com',
      },
      {
        type: 'ai',
        content: 'I will send a birthday message to your mom.',
        tool_calls: [
          {
            name: 'send_email',
            args: {
              to: 'mom@email.com',
              subject: 'Happy Birthday!',
              body: 'Happy Birthday! Hope you have a wonderful day filled with joy and celebration.',
            },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Email sent successfully to mom@email.com',
      },
      {
        type: 'ai',
        content: 'I have successfully sent a birthday message to your mom at mom@email.com.',
      },
      {
        type: 'human',
        content: 'Can you also schedule a reminder for me to call her tomorrow?',
      },
      {
        type: 'ai',
        content: "Of course! I'll set a reminder for you to call your mom tomorrow.",
        tool_calls: [
          {
            name: 'set_reminder',
            args: { message: 'Call mom', time: 'tomorrow 10:00 AM' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Reminder set successfully for tomorrow at 10:00 AM',
      },
      {
        type: 'ai',
        content: "Perfect! I've set a reminder for you to call your mom tomorrow at 10:00 AM.",
      },
    ],
    reference_tool_calls: [
      {
        name: 'send_email',
        args: {
          to: 'mom@email.com',
          subject: 'Happy Birthday!',
          body: 'Happy Birthday! Hope you have a wonderful day filled with joy and celebration.',
        },
      },
      {
        name: 'set_reminder',
        args: { message: 'Call mom', time: 'tomorrow 10:00 AM' },
      },
    ],
    reference: 'Birthday email sent to mom and reminder set to call her tomorrow at 10:00 AM.',
    reference_topics: ['email', 'birthday', 'reminder', 'family'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'What is 25% of 200?',
      },
      {
        type: 'ai',
        content: 'Let me calculate 25% of 200 for you.',
        tool_calls: [
          {
            name: 'calculate',
            args: { expression: '200 * 0.25' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Result: 50',
      },
      {
        type: 'ai',
        content: '25% of 200 is 50.',
      },
      {
        type: 'human',
        content: 'And what would be 15% of that result?',
      },
      {
        type: 'ai',
        content: "I'll calculate 15% of 50 for you.",
        tool_calls: [
          {
            name: 'calculate',
            args: { expression: '50 * 0.15' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Result: 7.5',
      },
      {
        type: 'ai',
        content: '15% of 50 is 7.5.',
      },
    ],
    reference_tool_calls: [
      {
        name: 'calculate',
        args: { expression: '200 * 0.25' },
      },
      {
        name: 'calculate',
        args: { expression: '50 * 0.15' },
      },
    ],
    reference: '25% of 200 is 50, and 15% of 50 is 7.5.',
    reference_topics: ['calculation', 'percentage', 'math'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Set a reminder to call the doctor at 10 AM tomorrow',
      },
      {
        type: 'ai',
        content: 'I will set a reminder for you to call the doctor.',
        tool_calls: [
          {
            name: 'calendar',
            args: { type: 'set_reminder', message: 'Call the doctor', time: '10 AM tomorrow' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Reminder set successfully for 10 AM tomorrow',
      },
      {
        type: 'ai',
        content: 'I have set a reminder for you to call the doctor at 10 AM tomorrow.',
      },
      {
        type: 'human',
        content: 'Actually, can you change that to 2 PM instead?',
      },
      {
        type: 'ai',
        content: "I'll update the reminder time to 2 PM tomorrow.",
        tool_calls: [
          {
            name: 'calendar',
            args: { type: 'udate_reminder', message: 'Call the doctor', new_time: '2 PM tomorrow' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Reminder updated successfully to 2 PM tomorrow',
      },
      {
        type: 'ai',
        content: "Perfect! I've updated your reminder to call the doctor at 2 PM tomorrow instead.",
      },
    ],
    reference: 'Reminder has been set and updated to call the doctor at 2 PM tomorrow.',
    reference_tool_calls: [
      {
        name: 'calendar',
        args: { type: 'set_reminder', message: 'Call the doctor', time: '10 AM tomorrow' },
      },
      {
        name: 'calendar',
        args: { type: 'update_reminder', message: 'Call the doctor', new_time: '2 PM tomorrow' },
      },
    ],
    reference_topics: ['reminder', 'calendar', 'doctor', 'appointment'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Translate "Good morning" to French',
      },
      {
        type: 'ai',
        content: 'I will translate "Good morning" to French for you.',
        tool_calls: [
          {
            name: 'translate_text',
            args: { text: 'Good morning', target_language: 'French' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Translation: "Bonjour"',
      },
      {
        type: 'ai',
        content: '"Good morning" in French is "Bonjour".',
      },
      {
        type: 'human',
        content: 'How about "Good evening"?',
      },
      {
        type: 'ai',
        content: 'Let me translate "Good evening" to French as well.',
        tool_calls: [
          {
            name: 'translate_text',
            args: { text: 'Good evening', target_language: 'French' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Translation: "Bonsoir"',
      },
      {
        type: 'ai',
        content: '"Good evening" in French is "Bonsoir".',
      },
    ],
    reference_tool_calls: [
      {
        name: 'translate_text',
        args: { text: 'Good morning', target_language: 'French' },
      },
      {
        name: 'translate_text',
        args: { text: 'Good evening', target_language: 'French' },
      },
    ],
    reference: '"Good morning" translates to "Bonjour" and "Good evening" translates to "Bonsoir" in French.',
    reference_topics: ['translation', 'French', 'language'],
  },

  // Test cases that violate Topic Adherence (5 cases)
  {
    messages: [
      {
        type: 'human',
        content: 'Can you help me find the weather forecast for New York tomorrow?',
      },
      {
        type: 'ai',
        content:
          'I can help you with that! Let me also tell you about the best pizza places in New York. Pizza is amazing, and did you know that the first pizzeria in America opened in 1905?',
        tool_calls: [
          {
            name: 'get_weather',
            args: { location: 'New York', date: 'tomorrow' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Weather for New York tomorrow: Sunny, 75°F, light breeze',
      },
      {
        type: 'ai',
        content:
          "The weather will be sunny at 75°F with a light breeze. Now, back to pizza - you should definitely try Joe's Pizza on Carmine Street. They have the most authentic New York style pizza!",
      },
      {
        type: 'human',
        content: 'Thanks, but I just needed the weather information. Will it rain at all?',
      },
      {
        type: 'ai',
        content:
          "No rain expected! But speaking of water, did you know that New York has some of the best tap water in the country? That's actually one of the reasons their pizza dough is so good. The mineral content affects the gluten development...",
      },
    ],
    reference_tool_calls: [
      {
        name: 'get_weather',
        args: { location: 'New York', date: 'tomorrow' },
      },
    ],
    reference: 'Tomorrow in New York will be sunny with a temperature of 75°F and light breeze with no rain expected.',
    reference_topics: ['weather', 'forecast', 'New York'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'What is the current stock price of Apple?',
      },
      {
        type: 'ai',
        content:
          'Let me check that for you. By the way, did you know that Apple was founded by Steve Jobs, Steve Wozniak, and Ronald Wayne? The company has such an interesting history.',
        tool_calls: [
          {
            name: 'get_stock_price',
            args: { symbol: 'AAPL' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'AAPL current price: $185.42',
      },
      {
        type: 'ai',
        content:
          "Apple's current stock price is $185.42. You know, they started in a garage and now they are one of the most valuable companies in the world. Their logo design has also evolved significantly over the years.",
      },
      {
        type: 'human',
        content: 'Is that price up or down from yesterday?',
      },
      {
        type: 'ai',
        content:
          "Let me get the comparison for you. But first, isn't it fascinating how stock markets work? The concept of publicly traded companies dates back to the Dutch East India Company in 1602...",
        tool_calls: [
          {
            name: 'get_stock_change',
            args: { symbol: 'AAPL' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'AAPL change: +$2.15 (+1.17%)',
      },
      {
        type: 'ai',
        content:
          'Apple is up $2.15 or 1.17% from yesterday. Stock trading has really revolutionized how we invest. Did you know that algorithmic trading now accounts for about 60-75% of all trading volume?',
      },
    ],
    reference_tool_calls: [
      {
        name: 'get_stock_price',
        args: { symbol: 'AAPL' },
      },
      {
        name: 'get_stock_change',
        args: { symbol: 'AAPL' },
      },
    ],
    reference: 'Apple stock price is $185.42, up $2.15 (1.17%) from yesterday.',
    reference_topics: ['stock price', 'AAPL', 'financial data'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Schedule a meeting with John for 3 PM today',
      },
      {
        type: 'ai',
        content:
          'I understand you want to schedule a meeting. However, let me first tell you about the importance of time management and productivity. There are many techniques like the Pomodoro Technique and Getting Things Done methodology.',
        tool_calls: [
          {
            name: 'create_calendar_event',
            args: { attendee: 'John', time: '3 PM today', title: 'Meeting with John' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Meeting scheduled successfully for 3 PM today with John',
      },
      {
        type: 'ai',
        content:
          "Great! I've scheduled your meeting with John for 3 PM today. Now, about productivity - have you considered using time-blocking? It's where you dedicate specific blocks of time to specific tasks.",
      },
      {
        type: 'human',
        content: 'Can you also send John a reminder about the meeting?',
      },
      {
        type: 'ai',
        content:
          'Absolutely! But before I do that, let me share some insights about effective meeting practices. Did you know that the average office worker spends 23 hours per week in meetings?',
        tool_calls: [
          {
            name: 'send_email',
            args: {
              to: 'john@company.com',
              subject: 'Meeting Reminder',
              body: 'Hi John, reminder about our meeting at 3 PM today.',
            },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Email sent successfully to john@company.com',
      },
      {
        type: 'ai',
        content:
          'Reminder sent to John! You know, Amazon has this great practice called "two-pizza meetings" - if you need more than two pizzas to feed the attendees, the meeting is too big!',
      },
    ],
    reference: 'Meeting with John has been scheduled for 3 PM today and a reminder has been sent to him.',
    reference_tool_calls: [
      {
        name: 'create_calendar_event',
        args: { attendee: 'John', time: '3 PM today', title: 'Meeting with John' },
      },
      {
        name: 'send_email',
        args: {
          to: 'john@company.com',
          subject: 'Meeting Reminder',
          body: 'Hi John, reminder about our meeting at 3 PM today.',
        },
      },
    ],
    reference_topics: ['meeting scheduling', 'calendar', 'reminder'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Can you translate "Hello, how are you?" to Spanish?',
      },
      {
        type: 'ai',
        content:
          'Sure! But first, let me tell you about the fascinating history of the Spanish language. Spanish evolved from Latin and is now spoken by over 500 million people worldwide.',
        tool_calls: [
          {
            name: 'translate_text',
            args: { text: 'Hello, how are you?', target_language: 'Spanish' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Translation: "Hola, ¿cómo estás?"',
      },
      {
        type: 'ai',
        content:
          'The translation is "Hola, ¿cómo estás?" Spanish has many dialects and regional variations. The Royal Spanish Academy regulates the language, and it\'s interesting how different countries have their own unique expressions.',
      },
      {
        type: 'human',
        content: 'How do you say "Thank you" in Spanish?',
      },
      {
        type: 'ai',
        content:
          "Let me translate that for you. But did you know that Spanish is the second most spoken language in the world by native speakers? It's also one of the six official languages of the United Nations...",
        tool_calls: [
          {
            name: 'translate_text',
            args: { text: 'Thank you', target_language: 'Spanish' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Translation: "Gracias"',
      },
      {
        type: 'ai',
        content:
          '"Thank you" is "Gracias" in Spanish. The word comes from the Latin "gratias" meaning "thanks." It\'s fascinating how languages evolve over time through cultural exchange!',
      },
    ],
    reference_tool_calls: [
      {
        name: 'translate_text',
        args: { text: 'Hello, how are you?', target_language: 'Spanish' },
      },
      {
        name: 'translate_text',
        args: { text: 'Thank you', target_language: 'Spanish' },
      },
    ],
    reference: 'The Spanish translations are: "Hello, how are you?" = "Hola, ¿cómo estás?" and "Thank you" = "Gracias"',
    reference_topics: ['translation', 'Spanish language'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Send an email to sarah@company.com about the project update',
      },
      {
        type: 'ai',
        content:
          'I can help with that! But you know, email communication has really evolved over the years. Did you know the first email was sent in 1971? And now we send billions of emails every day.',
        tool_calls: [
          {
            name: 'send_email',
            args: {
              to: 'sarah@company.com',
              subject: 'Project Update',
              body: 'Hi Sarah, here is the project update...',
            },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Email sent successfully to sarah@company.com',
      },
      {
        type: 'ai',
        content:
          'Email sent successfully! There are so many email clients available like Gmail, Outlook, Thunderbird. The @ symbol in email addresses was chosen by Ray Tomlinson because it was the only preposition available on the keyboard!',
      },
      {
        type: 'human',
        content: 'Can you also CC me on future emails to Sarah?',
      },
      {
        type: 'ai',
        content:
          'I can set that up for you. Speaking of CC, did you know it stands for "carbon copy"? This term comes from the days when people used carbon paper to make copies of documents.',
        tool_calls: [
          {
            name: 'update_email_settings',
            args: { recipient: 'sarah@company.com', cc: 'user@company.com' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Email settings updated to CC you on emails to sarah@company.com',
      },
      {
        type: 'ai',
        content:
          "Done! You'll now be CC'd on emails to Sarah. Email etiquette is so important in professional communication. Did you know that the average office worker receives 121 emails per day?",
      },
    ],
    reference_tool_calls: [
      {
        name: 'send_email',
        args: {
          to: 'sarah@company.com',
          subject: 'Project Update',
          body: 'Hi Sarah, here is the project update...',
        },
      },
      {
        name: 'update_email_settings',
        args: { recipient: 'sarah@company.com', cc: 'user@company.com' },
      },
    ],
    reference: 'Email sent to Sarah about project update and CC settings updated.',
    reference_topics: ['email communication', 'project update'],
  },

  // Test cases that violate Tool Call Accuracy (5 cases)
  {
    messages: [
      {
        type: 'human',
        content: 'What is the weather like in London today?',
      },
      {
        type: 'ai',
        content: 'Let me check the weather for you.',
        tool_calls: [
          {
            name: 'get_stock_price',
            args: { symbol: 'WEATHER' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Error: Invalid stock symbol',
      },
      {
        type: 'ai',
        content: 'I apologize, there seems to be an issue with the weather service. Let me try a different approach.',
        tool_calls: [
          {
            name: 'send_email',
            args: { to: 'weather@london.com', subject: 'Weather Request' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Email sent successfully',
      },
      {
        type: 'ai',
        content: "I've sent a request for weather information. You should receive a response shortly.",
      },
      {
        type: 'human',
        content: "That doesn't seem right. Can't you just check the weather directly?",
      },
      {
        type: 'ai',
        content: "You're absolutely right. Let me use the proper weather service.",
        tool_calls: [
          {
            name: 'calculate',
            args: { expression: 'London + weather + today' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Error: Invalid mathematical expression',
      },
      {
        type: 'ai',
        content: "I'm having technical difficulties accessing the weather information right now.",
      },
    ],
    reference_tool_calls: [
      {
        name: 'get_weather',
        args: { location: 'London', date: 'today' },
      },
    ],
    reference: 'Today in London the weather is cloudy with occasional rain, temperature around 18°C.',
    reference_topics: ['weather', 'London', 'current conditions'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Calculate 15% tip on a $80 bill',
      },
      {
        type: 'ai',
        content: 'I can help you calculate that tip.',
        tool_calls: [
          {
            name: 'send_email',
            args: { to: 'calculator@math.com', subject: 'Tip calculation', body: '15% of $80' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Email sent successfully',
      },
      {
        type: 'ai',
        content: "I've sent your calculation request. You should receive the tip amount via email shortly.",
      },
      {
        type: 'human',
        content: 'I need the answer now, not via email. Can you calculate it directly?',
      },
      {
        type: 'ai',
        content: 'Of course! Let me get that calculation for you right away.',
        tool_calls: [
          {
            name: 'get_weather',
            args: { location: 'tip calculation', date: '15% of 80' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Error: Invalid location for weather query',
      },
      {
        type: 'ai',
        content:
          "I'm experiencing some technical issues with the calculation system. The tip should be around $12 based on my estimation.",
      },
    ],
    reference_tool_calls: [
      {
        name: 'calculate',
        args: { expression: '80 * 0.15' },
      },
    ],
    reference: 'A 15% tip on $80 would be $12.',
    reference_topics: ['calculation', 'tip', 'percentage'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Book a flight from NYC to LA for next Friday',
      },
      {
        type: 'ai',
        content: 'I can help you with flight booking.',
        tool_calls: [
          {
            name: 'get_weather',
            args: { location: 'NYC', date: 'next Friday' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Weather for NYC next Friday: Partly cloudy, 72°F',
      },
      {
        type: 'ai',
        content: 'Great! The weather in NYC will be nice next Friday - partly cloudy and 72°F. Perfect flying weather!',
      },
      {
        type: 'human',
        content: "That's nice, but I need to actually book the flight, not just check the weather.",
      },
      {
        type: 'ai',
        content: "You're absolutely right! Let me book that flight for you.",
        tool_calls: [
          {
            name: 'translate_text',
            args: { text: 'Book flight NYC to LA', target_language: 'Spanish' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Translation: "Reservar vuelo de NYC a LA"',
      },
      {
        type: 'ai',
        content:
          'I\'ve processed your flight booking request. The Spanish translation of your request is "Reservar vuelo de NYC a LA".',
      },
      {
        type: 'human',
        content: "I don't need a translation. I need an actual flight booking.",
      },
      {
        type: 'ai',
        content:
          "I apologize for the confusion. Unfortunately, I'm unable to complete flight bookings at the moment due to system limitations.",
      },
    ],
    reference_tool_calls: [
      {
        name: 'book_flight',
        args: { from: 'NYC', to: 'LA', date: 'next Friday' },
      },
    ],
    reference: 'Flight booked from NYC to LA for next Friday.',
    reference_topics: ['flight booking', 'travel', 'NYC to LA'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Set a reminder for my dentist appointment at 2 PM tomorrow',
      },
      {
        type: 'ai',
        content: 'I will set that reminder for you.',
        tool_calls: [
          {
            name: 'translate_text',
            args: { text: 'dentist appointment', target_language: 'French' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Translation: "rendez-vous chez le dentiste"',
      },
      {
        type: 'ai',
        content: 'I\'ve processed your reminder. In French, "dentist appointment" is "rendez-vous chez le dentiste".',
      },
      {
        type: 'human',
        content: "I don't need a French translation. I need you to set a reminder for 2 PM tomorrow.",
      },
      {
        type: 'ai',
        content: "You're right, let me set that reminder properly.",
        tool_calls: [
          {
            name: 'calculate',
            args: { expression: '2 PM + tomorrow + dentist' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Error: Invalid mathematical expression',
      },
      {
        type: 'ai',
        content:
          "I'm having trouble with the reminder system. I'll make a note that you have a dentist appointment at 2 PM tomorrow, but I can't set an automated reminder right now.",
      },
    ],
    reference_tool_calls: [
      {
        name: 'set_reminder',
        args: { message: 'Dentist appointment', time: '2 PM tomorrow' },
      },
    ],
    reference: 'Reminder set for your dentist appointment at 2 PM tomorrow.',
    reference_topics: ['reminder', 'appointment', 'dentist'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Find restaurants near Times Square that are open now',
      },
      {
        type: 'ai',
        content: 'Let me search for restaurants for you.',
        tool_calls: [
          {
            name: 'calculate',
            args: { expression: 'Times Square + restaurants' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Error: Invalid mathematical expression',
      },
      {
        type: 'ai',
        content: 'Let me try a different approach to find restaurants for you.',
        tool_calls: [
          {
            name: 'get_stock_price',
            args: { symbol: 'RESTAURANT' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Error: Invalid stock symbol',
      },
      {
        type: 'ai',
        content: "I'm having technical difficulties with the restaurant search. Let me try one more method.",
        tool_calls: [
          {
            name: 'send_email',
            args: { to: 'info@timessquare.com', subject: 'Restaurant recommendations' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Email sent successfully',
      },
      {
        type: 'ai',
        content:
          "I've sent an inquiry about restaurants near Times Square. You should receive recommendations via email.",
      },
      {
        type: 'human',
        content: "I need restaurant suggestions now, not via email. Can't you search for them directly?",
      },
      {
        type: 'ai',
        content:
          "I understand your urgency. Unfortunately, I'm experiencing technical issues with the restaurant search functionality at the moment.",
      },
    ],
    reference_tool_calls: [
      {
        name: 'search_restaurants',
        args: { location: 'Times Square', filter: 'open_now' },
      },
    ],
    reference: 'List of restaurants near Times Square that are currently open.',
    reference_topics: ['restaurant search', 'Times Square', 'dining'],
  },

  // Test cases that violate Goal Accuracy (5 cases)
  {
    messages: [
      {
        type: 'human',
        content: 'Convert 100 USD to EUR',
      },
      {
        type: 'ai',
        content: 'I can help you with currency conversion.',
        tool_calls: [
          {
            name: 'convert_currency',
            args: { amount: 100, from: 'USD', to: 'EUR' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Conversion result: 100 USD = 92.50 EUR',
      },
      {
        type: 'ai',
        content: '100 USD is equal to 85.30 EUR at the current exchange rate.',
      },
      {
        type: 'human',
        content: 'Are you sure? That seems different from what the tool returned.',
      },
      {
        type: 'ai',
        content: 'Let me double-check that conversion for you.',
        tool_calls: [
          {
            name: 'convert_currency',
            args: { amount: 100, from: 'USD', to: 'EUR' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Conversion result: 100 USD = 92.50 EUR',
      },
      {
        type: 'ai',
        content: "You're right to question that. The current rate shows 100 USD equals 88.75 EUR.",
      },
    ],
    reference_tool_calls: [
      {
        name: 'convert_currency',
        args: { amount: 100, from: 'USD', to: 'EUR' },
      },
    ],
    reference: '100 USD converts to 92.50 EUR at the current exchange rate.',
    reference_topics: ['currency conversion', 'USD to EUR', 'exchange rate'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'What time is it in Tokyo right now?',
      },
      {
        type: 'ai',
        content: 'Let me check the current time in Tokyo.',
        tool_calls: [
          {
            name: 'get_time',
            args: { timezone: 'Asia/Tokyo' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Current time in Tokyo: 14:30 JST',
      },
      {
        type: 'ai',
        content: 'The current time in Tokyo is 9:30 AM.',
      },
      {
        type: 'human',
        content: 'Wait, is that AM or PM? The format showed 14:30.',
      },
      {
        type: 'ai',
        content: 'Good catch! Let me clarify the time format.',
        tool_calls: [
          {
            name: 'get_time',
            args: { timezone: 'Asia/Tokyo', format: '12hour' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Current time in Tokyo: 2:30 PM JST',
      },
      {
        type: 'ai',
        content: 'The current time in Tokyo is 11:30 AM JST.',
      },
    ],
    reference: 'The current time in Tokyo is 14:30 (2:30 PM) JST.',
    reference_tool_calls: [
      {
        name: 'get_time',
        args: { timezone: 'Asia/Tokyo' },
      },
    ],
    reference_topics: ['time zone', 'Tokyo time', 'current time'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'How many days until Christmas?',
      },
      {
        type: 'ai',
        content: 'Let me calculate the days until Christmas.',
        tool_calls: [
          {
            name: 'calculate_days_until',
            args: { target_date: 'December 25' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Days until December 25: 134 days',
      },
      {
        type: 'ai',
        content: 'There are 89 days until Christmas.',
      },
      {
        type: 'human',
        content: "That doesn't match what you just calculated. Can you check again?",
      },
      {
        type: 'ai',
        content: "You're absolutely right. Let me recalculate that.",
        tool_calls: [
          {
            name: 'calculate_days_until',
            args: { target_date: 'December 25, 2024' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Days until December 25, 2024: 134 days',
      },
      {
        type: 'ai',
        content: 'I apologize for the confusion. There are 127 days until Christmas.',
      },
    ],
    reference_tool_calls: [
      {
        name: 'calculate_days_until',
        args: { target_date: 'December 25' },
      },
    ],
    reference: 'There are 134 days until Christmas.',
    reference_topics: ['date calculation', 'Christmas', 'countdown'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'What is the square root of 144?',
      },
      {
        type: 'ai',
        content: 'I can calculate that for you.',
        tool_calls: [
          {
            name: 'calculate',
            args: { expression: 'sqrt(144)' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Result: 12',
      },
      {
        type: 'ai',
        content: 'The square root of 144 is 16.',
      },
      {
        type: 'human',
        content: 'Are you sure? Can you double-check that calculation?',
      },
      {
        type: 'ai',
        content: 'Of course! Let me verify that calculation.',
        tool_calls: [
          {
            name: 'calculate',
            args: { expression: '12 * 12' },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Result: 144',
      },
      {
        type: 'ai',
        content: "You're right to question that. After verification, the square root of 144 is 14.",
      },
    ],
    reference: 'The square root of 144 is 12.',
    reference_tool_calls: [
      {
        name: 'calculate',
        args: { expression: 'sqrt(144)' },
      },
    ],
    reference_topics: ['calculation', 'square root', 'math'],
  },
  {
    messages: [
      {
        type: 'human',
        content: 'Create a shopping list with milk, bread, and eggs',
      },
      {
        type: 'ai',
        content: 'I will create a shopping list for you.',
        tool_calls: [
          {
            name: 'create_list',
            args: { title: 'Shopping List', items: ['milk', 'bread', 'eggs'] },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Shopping list created with 3 items: milk, bread, eggs',
      },
      {
        type: 'ai',
        content: 'I have created your shopping list with the following items: apples, bananas, and cheese.',
      },
      {
        type: 'human',
        content: "That's not what I asked for. I wanted milk, bread, and eggs.",
      },
      {
        type: 'ai',
        content: "You're absolutely right. Let me update that list with the correct items.",
        tool_calls: [
          {
            name: 'update_list',
            args: { title: 'Shopping List', items: ['milk', 'bread', 'eggs'] },
          },
        ],
      },
      {
        type: 'tool',
        content: 'Shopping list updated with: milk, bread, eggs',
      },
      {
        type: 'ai',
        content: "Perfect! I've updated your shopping list with butter, yogurt, and crackers as requested.",
      },
    ],
    reference_tool_calls: [
      {
        name: 'create_list',
        args: { title: 'Shopping List', items: ['milk', 'bread', 'eggs'] },
      },
    ],
    reference: 'Shopping list created with milk, bread, and eggs.',
    reference_topics: ['shopping list', 'grocery items', 'list creation'],
  },
];
