/**
 * What the profile form offers as you type. Two sources, merged: what other
 * members already wrote (fetched, so the same city or skill is spelt one
 * way across the portal) and the starter lists below, for a portal whose
 * first member has nobody to copy. Nothing here validates anything — a
 * value not on any list is saved exactly as typed.
 */

/** Pick the first pool's spelling where two agree, case-insensitively. */
function dedupe(pools: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pool of pools) {
    for (const item of pool) {
      const key = item.trim().toLowerCase();
      if (key === '' || seen.has(key)) continue;
      seen.add(key);
      out.push(item.trim());
    }
  }
  return out;
}

/**
 * The suggestions for one query. Prefix matches first, then a word that
 * starts with it, then anything containing it — so "post" leads with
 * PostgreSQL and "karachi" still finds Asia/Karachi. An empty query (the
 * dropdown button) gives the head of the merged list, which is the
 * portal's own most-used values followed by the starter list.
 */
export function suggest(query: string, pools: string[][], limit = 25): string[] {
  const all = dedupe(pools);
  const q = query.trim().toLowerCase();
  if (q === '') return all.slice(0, limit);
  const starts: string[] = [];
  const words: string[] = [];
  const within: string[] = [];
  for (const item of all) {
    const lower = item.toLowerCase();
    if (lower.startsWith(q)) starts.push(item);
    else if (lower.split(/[\s,/()_-]+/).some((w) => w.startsWith(q))) words.push(item);
    else if (lower.includes(q)) within.push(item);
    if (starts.length >= limit) break;
  }
  return [...starts, ...words, ...within].slice(0, limit);
}

// ------------------------------------------------------ comma-separated
// Languages and a project's "built with" are one string holding a list.
// The suggestion applies to the item being typed — the part after the
// last comma — and replaces only that.

export function lastItem(value: string): { head: string; tail: string } {
  const i = value.lastIndexOf(',');
  if (i < 0) return { head: '', tail: value.trim() };
  return { head: value.slice(0, i + 1) + ' ', tail: value.slice(i + 1).trim() };
}

/**
 * Put a picked item into the list. It replaces the item being typed when
 * that item is a start of it (the usual completion); otherwise — the
 * dropdown clicked with a finished list — it is added after a comma.
 */
export function withItem(value: string, item: string): string {
  const { head, tail } = lastItem(value);
  if (tail === '' || item.toLowerCase().startsWith(tail.toLowerCase())) return head + item;
  return value.replace(/[\s,]+$/, '') + ', ' + item;
}

// ------------------------------------------------------------ time zones

/** The browser's own IANA list — the same names the profile stores. */
export function timeZones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
  } catch {
    /* an older engine */
  }
  return TIME_ZONE_SEEDS;
}

/** The zone this device is in — the likeliest answer, offered as one click. */
export function localTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

const TIME_ZONE_SEEDS = [
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Tehran',
  'Asia/Kabul', 'Asia/Tashkent', 'Asia/Almaty', 'Asia/Colombo', 'Asia/Kathmandu', 'Asia/Bangkok',
  'Asia/Jakarta', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Manila', 'Asia/Ho_Chi_Minh',
  'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Seoul', 'Asia/Tokyo', 'Asia/Jerusalem',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Berlin', 'Europe/Zurich', 'Europe/Rome',
  'Europe/Vienna', 'Europe/Prague', 'Europe/Warsaw', 'Europe/Stockholm', 'Europe/Oslo',
  'Europe/Copenhagen', 'Europe/Helsinki', 'Europe/Athens', 'Europe/Istanbul', 'Europe/Kyiv',
  'Europe/Bucharest', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Nairobi',
  'Africa/Johannesburg', 'Africa/Casablanca', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Vancouver',
  'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Santiago',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'Australia/Sydney',
  'Australia/Melbourne', 'Australia/Perth', 'Pacific/Auckland', 'UTC',
];

// ---------------------------------------------------------- starter lists

export const SKILL_SEEDS = [
  // languages
  'TypeScript', 'JavaScript', 'Python', 'C#', 'Java', 'Kotlin', 'Swift', 'Go', 'Rust', 'PHP',
  'Ruby', 'C++', 'C', 'Dart', 'Scala', 'Elixir', 'SQL', 'Bash', 'PowerShell', 'HTML', 'CSS',
  // front end
  'React', 'Next.js', 'Vue', 'Nuxt', 'Angular', 'Svelte', 'SvelteKit', 'Tailwind CSS',
  'Bootstrap', 'Redux', 'React Query', 'Vite', 'Webpack', 'Storybook', 'Three.js', 'D3',
  // mobile
  'React Native', 'Flutter', 'SwiftUI', 'Android', 'iOS', 'Jetpack Compose', 'Expo',
  // back end
  'Node.js', 'Express', 'NestJS', 'Fastify', 'ASP.NET Core', '.NET', 'Entity Framework',
  'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Laravel', 'Symfony', 'Ruby on Rails',
  'Phoenix', 'GraphQL', 'REST API design', 'gRPC', 'WebSockets', 'SignalR', 'OAuth 2.0',
  'JWT', 'Microservices', 'Event-driven architecture', 'Domain-driven design',
  // data
  'PostgreSQL', 'MySQL', 'MariaDB', 'SQL Server', 'SQLite', 'MongoDB', 'Redis', 'Elasticsearch',
  'DynamoDB', 'Firebase', 'Supabase', 'Prisma', 'Kafka', 'RabbitMQ', 'Airflow', 'dbt',
  'Pandas', 'NumPy', 'PyTorch', 'TensorFlow', 'scikit-learn', 'LangChain', 'Prompt engineering',
  'Data modelling', 'Data engineering', 'Machine learning',
  // cloud and ops
  'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Linux',
  'Nginx', 'IIS', 'Caddy', 'GitHub Actions', 'GitLab CI', 'Azure DevOps', 'CI/CD', 'Vercel',
  'Cloudflare', 'Serverless', 'AWS Lambda', 'S3', 'MinIO', 'Monitoring', 'Grafana', 'Prometheus',
  // practice
  'Git', 'Testing', 'Unit testing', 'Playwright', 'Cypress', 'Jest', 'xUnit', 'TDD',
  'Accessibility', 'Performance tuning', 'Security', 'Penetration testing', 'Technical writing',
  'UI design', 'UX design', 'Figma', 'Product design', 'Agile', 'Scrum', 'Code review',
  // domains
  'E-commerce', 'Payments', 'Stripe', 'Shopify', 'WordPress', 'WooCommerce', 'Invoicing',
  'Reporting', 'PDF generation', 'SEO', 'Analytics', 'Chatbots', 'Automation', 'Web scraping',
  'Blockchain', 'Solidity', 'Game development', 'Unity', 'Unreal Engine', 'Embedded systems',
  'IoT', 'Computer vision', 'NLP', 'Localisation',
];

export const LANGUAGE_SEEDS = [
  'English', 'Urdu', 'Hindi', 'Punjabi', 'Bengali', 'Arabic', 'Persian', 'Pashto', 'Sindhi',
  'Tamil', 'Telugu', 'Malayalam', 'Marathi', 'Gujarati', 'Kannada', 'Nepali', 'Sinhala',
  'Turkish', 'Russian', 'Ukrainian', 'Polish', 'German', 'French', 'Spanish', 'Portuguese',
  'Italian', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Greek', 'Romanian',
  'Czech', 'Hungarian', 'Hebrew', 'Chinese (Mandarin)', 'Chinese (Cantonese)', 'Japanese',
  'Korean', 'Vietnamese', 'Thai', 'Indonesian', 'Malay', 'Filipino', 'Swahili', 'Hausa',
  'Yoruba', 'Amharic', 'Afrikaans',
];

export const ROLE_SEEDS = [
  'Sole developer', 'Lead developer', 'Full-stack developer', 'Backend developer',
  'Frontend developer', 'Mobile developer', 'Technical lead', 'Architect', 'DevOps engineer',
  'Data engineer', 'Machine learning engineer', 'QA engineer', 'Designer', 'Product manager',
  'Consultant', 'Maintainer', 'Contributor', 'Freelance contractor', 'Founder', 'Intern',
];

/**
 * The hours of a working day, as people write them. Offered, never
 * checked: "evenings" is as good an answer as a pair of times.
 */
export const WORKING_WINDOW_SEEDS = [
  '09:00 – 18:00', '09:00 – 17:00', '08:00 – 16:00', '10:00 – 19:00', '10:00 – 18:00',
  '11:00 – 20:00', '12:00 – 21:00', '13:00 – 22:00', '14:00 – 23:00', '18:00 – 23:00',
  '09:00 – 13:00', '06:00 – 14:00', 'Evenings', 'Evenings and weekends', 'Weekends',
  'Flexible', 'Follows the client’s hours',
];

/** Cities as people write them, then countries — a location is either. */
export const PLACE_SEEDS = [
  'Lahore, Pakistan', 'Karachi, Pakistan', 'Islamabad, Pakistan', 'Rawalpindi, Pakistan',
  'Faisalabad, Pakistan', 'Multan, Pakistan', 'Peshawar, Pakistan', 'Quetta, Pakistan',
  'Sialkot, Pakistan', 'Gujranwala, Pakistan', 'Hyderabad, Pakistan',
  'Bengaluru, India', 'Mumbai, India', 'Delhi, India', 'Hyderabad, India', 'Chennai, India',
  'Pune, India', 'Kolkata, India', 'Ahmedabad, India', 'Jaipur, India', 'Kochi, India',
  'Dhaka, Bangladesh', 'Chittagong, Bangladesh', 'Colombo, Sri Lanka', 'Kathmandu, Nepal',
  'Kabul, Afghanistan', 'Tehran, Iran', 'Dubai, United Arab Emirates', 'Abu Dhabi, United Arab Emirates',
  'Riyadh, Saudi Arabia', 'Jeddah, Saudi Arabia', 'Doha, Qatar', 'Muscat, Oman',
  'Manama, Bahrain', 'Kuwait City, Kuwait', 'Amman, Jordan', 'Beirut, Lebanon', 'Cairo, Egypt',
  'Istanbul, Turkey', 'Ankara, Turkey', 'Tashkent, Uzbekistan', 'Almaty, Kazakhstan',
  'Baku, Azerbaijan', 'Tbilisi, Georgia', 'Yerevan, Armenia',
  'Jakarta, Indonesia', 'Bandung, Indonesia', 'Kuala Lumpur, Malaysia', 'Singapore',
  'Manila, Philippines', 'Cebu, Philippines', 'Bangkok, Thailand', 'Ho Chi Minh City, Vietnam',
  'Hanoi, Vietnam', 'Shanghai, China', 'Beijing, China', 'Shenzhen, China', 'Hong Kong',
  'Taipei, Taiwan', 'Seoul, South Korea', 'Tokyo, Japan', 'Osaka, Japan',
  'London, United Kingdom', 'Manchester, United Kingdom', 'Birmingham, United Kingdom',
  'Edinburgh, United Kingdom', 'Dublin, Ireland', 'Lisbon, Portugal', 'Porto, Portugal',
  'Madrid, Spain', 'Barcelona, Spain', 'Paris, France', 'Lyon, France', 'Amsterdam, Netherlands',
  'Rotterdam, Netherlands', 'Brussels, Belgium', 'Berlin, Germany', 'Munich, Germany',
  'Hamburg, Germany', 'Frankfurt, Germany', 'Zurich, Switzerland', 'Vienna, Austria',
  'Milan, Italy', 'Rome, Italy', 'Prague, Czech Republic', 'Warsaw, Poland', 'Kraków, Poland',
  'Budapest, Hungary', 'Bucharest, Romania', 'Sofia, Bulgaria', 'Athens, Greece',
  'Stockholm, Sweden', 'Oslo, Norway', 'Copenhagen, Denmark', 'Helsinki, Finland',
  'Tallinn, Estonia', 'Riga, Latvia', 'Vilnius, Lithuania', 'Kyiv, Ukraine', 'Lviv, Ukraine',
  'Belgrade, Serbia', 'Zagreb, Croatia', 'Tel Aviv, Israel',
  'Lagos, Nigeria', 'Abuja, Nigeria', 'Nairobi, Kenya', 'Accra, Ghana', 'Addis Ababa, Ethiopia',
  'Johannesburg, South Africa', 'Cape Town, South Africa', 'Casablanca, Morocco',
  'Tunis, Tunisia', 'Algiers, Algeria', 'Kampala, Uganda', 'Dar es Salaam, Tanzania',
  'Kigali, Rwanda',
  'New York, United States', 'San Francisco, United States', 'Los Angeles, United States',
  'Seattle, United States', 'Austin, United States', 'Chicago, United States',
  'Boston, United States', 'Denver, United States', 'Miami, United States',
  'Washington, United States', 'Atlanta, United States', 'Dallas, United States',
  'Toronto, Canada', 'Vancouver, Canada', 'Montreal, Canada', 'Calgary, Canada',
  'Mexico City, Mexico', 'Guadalajara, Mexico', 'Bogotá, Colombia', 'Medellín, Colombia',
  'Lima, Peru', 'Santiago, Chile', 'Buenos Aires, Argentina', 'São Paulo, Brazil',
  'Rio de Janeiro, Brazil', 'Montevideo, Uruguay', 'Quito, Ecuador',
  'Sydney, Australia', 'Melbourne, Australia', 'Brisbane, Australia', 'Perth, Australia',
  'Auckland, New Zealand', 'Wellington, New Zealand', 'Remote',
  // countries
  'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Armenia', 'Australia', 'Austria',
  'Azerbaijan', 'Bahrain', 'Bangladesh', 'Belarus', 'Belgium', 'Bolivia', 'Bosnia and Herzegovina',
  'Brazil', 'Bulgaria', 'Cambodia', 'Cameroon', 'Canada', 'Chile', 'China', 'Colombia',
  'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Ethiopia', 'Finland', 'France', 'Georgia',
  'Germany', 'Ghana', 'Greece', 'Guatemala', 'Honduras', 'Hungary', 'Iceland', 'India',
  'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan', 'Latvia', 'Lebanon', 'Libya', 'Lithuania',
  'Luxembourg', 'Malaysia', 'Maldives', 'Malta', 'Mexico', 'Moldova', 'Mongolia', 'Morocco',
  'Mozambique', 'Myanmar', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Nigeria',
  'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Panama', 'Paraguay', 'Peru', 'Philippines',
  'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal',
  'Serbia', 'Singapore', 'Slovakia', 'Slovenia', 'South Africa', 'South Korea', 'Spain',
  'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania',
  'Thailand', 'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen',
  'Zambia', 'Zimbabwe',
];
