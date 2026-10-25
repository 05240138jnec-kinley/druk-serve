/* ===== Druk Serve - SAMPLE DATA =====
   BACKEND: later, this data will come from your MySQL database through an API.
   For now it is copied into the browser (localStorage) the first time you open the site. */

const SERVICES = [
  { id: 1, name: "Plumbing",         icon: "bi-droplet-fill",          desc: "Leaks, pipes, taps and bathroom fittings" },
  { id: 2, name: "Electrical",       icon: "bi-lightning-charge-fill", desc: "Wiring, switches, lights and repairs" },
  { id: 3, name: "Cleaning",         icon: "bi-stars",                 desc: "House, kitchen and deep cleaning" },
  { id: 4, name: "Carpentry",        icon: "bi-hammer",                desc: "Doors, furniture and wood repair" },
  { id: 5, name: "Painting",         icon: "bi-palette-fill",          desc: "Interior and exterior painting" },
  { id: 6, name: "Appliance Repair", icon: "bi-tools",                 desc: "Washing machines, fridges, heaters" },
  { id: 7, name: "Pest Control",     icon: "bi-bug-fill",              desc: "Safe removal of insects and rodents" }
];

const LOCATIONS = ["Thimphu", "Paro", "Phuentsholing", "Punakha", "Dewathang", "Other"];

/* Table: Service Provider (provider_id, name, email, phone_number, category, rating, is_verified) */
const DEFAULT_PROVIDERS = [
  { id: 1, name: "Sonam Tobgay",    category: "Electrical",       rating: 4.8, reviews: 42, experience: 6, rate: 400, location: "Thimphu",       verified: true,  phone: "17111111", email: "provider@drukserve.bt", bio: "Licensed electrician for homes and small offices." },
  { id: 2, name: "Tenzin Dorji",    category: "Plumbing",         rating: 4.6, reviews: 35, experience: 4, rate: 350, location: "Thimphu",       verified: true,  phone: "17222222", email: "tenzin@drukserve.bt",   bio: "Fixes leaks, installs taps and bathroom fittings." },
  { id: 3, name: "Dechen Wangmo",   category: "Cleaning",         rating: 4.9, reviews: 58, experience: 5, rate: 250, location: "Paro",          verified: true,  phone: "17333333", email: "dechen@drukserve.bt",   bio: "Careful and reliable house cleaning." },
  { id: 4, name: "Karma Phuntsho",  category: "Carpentry",        rating: 4.5, reviews: 21, experience: 8, rate: 450, location: "Phuentsholing", verified: true,  phone: "17444444", email: "karma@drukserve.bt",    bio: "Doors, windows and custom furniture." },
  { id: 5, name: "Yangchen Lhamo",  category: "Painting",         rating: 4.7, reviews: 30, experience: 5, rate: 300, location: "Thimphu",       verified: true,  phone: "17555555", email: "yangchen@drukserve.bt", bio: "Neat interior and exterior painting." },
  { id: 6, name: "Ugyen Dorji",     category: "Appliance Repair", rating: 4.4, reviews: 18, experience: 3, rate: 380, location: "Punakha",       verified: true,  phone: "17666666", email: "ugyen@drukserve.bt",    bio: "Repairs washing machines, fridges and heaters." },
  { id: 7, name: "Pema Zangmo",     category: "Cleaning",         rating: 4.3, reviews: 12, experience: 2, rate: 220, location: "Dewathang",     verified: true,  phone: "17777777", email: "pema@drukserve.bt",     bio: "Deep cleaning for kitchens and bathrooms." },
  { id: 8, name: "Namgay Tshering", category: "Pest Control",     rating: 4.2, reviews: 9,  experience: 4, rate: 500, location: "Thimphu",       verified: false, phone: "17888888", email: "namgay@drukserve.bt",   bio: "Safe pest control for homes." }
];

/* Logins for testing.
   BACKEND: real passwords are never stored like this. The database stores password_hash. */
const DEFAULT_USERS = [
  { id: 1, role: "admin",    name: "Admin",        email: "admin@drukserve.bt",    password: "Admin@123",    phone: "17000000", location: "Thimphu", address: "" },
  { id: 2, role: "customer", name: "Pema Choden",  email: "customer@drukserve.bt", password: "Customer@123", phone: "17999999", location: "Thimphu", address: "Norzin Lam, Thimphu" },
  { id: 3, role: "provider", name: "Sonam Tobgay", email: "provider@drukserve.bt", password: "Provider@123", phone: "17111111", location: "Thimphu", address: "", providerId: 1 }
];

/* Table: Booking (status: Pending / Confirmed / Completed / Cancelled) */
const DEFAULT_BOOKINGS = [
  { id: 1, customerId: 2, providerId: 1, service: "Electrical", date: "2026-11-02", time: "10:00", address: "Norzin Lam, Thimphu", notes: "Light switch not working in the living room.", status: "Confirmed", amount: 800,  payMethod: "Cash", paid: false },
  { id: 2, customerId: 2, providerId: 3, service: "Cleaning",   date: "2026-11-05", time: "14:00", address: "Norzin Lam, Thimphu", notes: "Full house cleaning.",                       status: "Pending",   amount: 1000, payMethod: "",     paid: false },
  { id: 3, customerId: 2, providerId: 2, service: "Plumbing",   date: "2026-10-12", time: "09:00", address: "Norzin Lam, Thimphu", notes: "Kitchen tap leaking.",                       status: "Completed", amount: 700,  payMethod: "mPay", paid: true  },
  { id: 4, customerId: 2, providerId: 5, service: "Painting",   date: "2026-09-20", time: "11:00", address: "Norzin Lam, Thimphu", notes: "Bedroom wall painting.",                     status: "Cancelled", amount: 1500, payMethod: "",     paid: false }
];

/* Table: Feedback */
const DEFAULT_FEEDBACK = [
  { id: 1, bookingId: 3, customerId: 2, providerId: 2, rating: 5, comment: "Fast and very professional work.", date: "2026-10-13" }
];

/* BACKEND: real-time notifications will come from Firebase (see your Chapter 4.1). */
const DEFAULT_NOTIFICATIONS = [
  { id: 1, role: "customer", icon: "bi-check-circle-fill", title: "Job Accepted",  text: "Your electrical job has been accepted by Sonam Tobgay.", time: "2h ago",     read: false },
  { id: 2, role: "customer", icon: "bi-tools",             title: "Job Completed", text: "Your plumbing job has been completed.",                 time: "Yesterday",  read: false },
  { id: 3, role: "customer", icon: "bi-credit-card-fill",  title: "Payment",       text: "Your payment was successful.",                          time: "3 days ago", read: true  },
  { id: 4, role: "provider", icon: "bi-calendar-plus",     title: "New Request",   text: "Pema Choden requested an electrical job.",              time: "1h ago",     read: false },
  { id: 5, role: "provider", icon: "bi-star-fill",         title: "New Feedback",  text: "A customer gave you 5 stars.",                          time: "Yesterday",  read: false }
];
