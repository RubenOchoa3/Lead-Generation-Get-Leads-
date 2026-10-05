/**
 * R&S target categories → GetLeads filters. `industries` are canonical GetLeads industry values
 * (get_available_values field=industries); the current dataset has no NAICS filter, so `naics`
 * is kept only for classifying rows imported from older exports.
 */
export const TARGET_CATEGORIES: Array<{ label: string; naics: string[]; industries: string[]; default?: boolean }> = [
  { label: "Medical offices", naics: ["6211", "6213"], industries: ["Medical Practices", "Physicians", "Chiropractors", "Optometrists", "Physical; Occupational and Speech Therapists"], default: true },
  { label: "Dental offices", naics: ["621210"], industries: ["Dentists"], default: true },
  { label: "Clinics", naics: ["6214", "6215"], industries: ["Outpatient Care Centers", "Medical and Diagnostic Laboratories", "Mental Health Care"], default: true },
  { label: "Office buildings", naics: ["531120", "5312"], industries: ["Leasing Non-residential Real Estate", "Commercial Real Estate"], default: true },
  { label: "Property management", naics: ["531311", "531312"], industries: ["Real Estate", "Leasing Residential Real Estate"], default: true },
  { label: "Warehouses", naics: ["4931", "531130"], industries: ["Warehousing and Storage"], default: true },
  { label: "Distribution centers", naics: ["4921", "4841", "42"], industries: ["Transportation; Logistics; Supply Chain and Storage", "Truck Transportation", "Freight and Package Transportation", "Wholesale"] },
  { label: "Manufacturing / industrial", naics: ["31", "32", "33"], industries: ["Manufacturing", "Food and Beverage Manufacturing", "Industrial Machinery Manufacturing", "Fabricated Metal Products", "Plastics Manufacturing", "Chemical Manufacturing"] },
  { label: "Schools", naics: ["6111"], industries: ["Primary and Secondary Education", "Education"] },
  { label: "Churches", naics: ["8131"], industries: ["Religious Institutions"] },
  { label: "Gyms / fitness", naics: ["71394"], industries: ["Wellness and Fitness Services", "Recreational Facilities"] },
  { label: "Auto dealerships", naics: ["4411"], industries: ["Retail Motor Vehicles"] },
  { label: "Daycares", naics: ["624410"], industries: ["Child Day Care Services"] },
  { label: "HOAs", naics: ["813990"], industries: ["Civic and Social Organizations"] },
  { label: "Facilities management", naics: ["561210"], industries: ["Facilities Services"] },
  { label: "Professional offices (legal, accounting, insurance)", naics: ["5411", "5412", "5242"], industries: ["Law Practice", "Legal Services", "Accounting", "Insurance", "Insurance Agencies and Brokerages", "Financial Services"] },
];

export const DEFAULT_CITIES = ["Bakersfield", "Fresno", "Visalia", "Delano", "Shafter", "Wasco", "Tulare", "Hanford"];
export const DEFAULT_TITLES = ["Facilities Manager", "Director of Facilities", "Property Manager", "Building Manager", "Operations Manager", "Director of Operations", "Office Manager", "General Manager", "Asset Manager", "Owner", "Practice Manager"];

export const COUNTRIES = ["United States", "Canada", "Mexico"];
export const ALL_STATES = "All states";
export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
  "Washington", "West Virginia", "Wisconsin", "Wyoming",
];

/** Central Valley cities whose newly registered businesses enter the registry waterfall. */
export const REGISTRY_CITIES = [
  ...DEFAULT_CITIES, "Arvin", "Lamont", "McFarland", "Taft", "Tehachapi", "Ridgecrest", "Clovis", "Sanger", "Selma", "Reedley",
  "Kerman", "Kingsburg", "Madera", "Porterville", "Lindsay", "Exeter", "Dinuba", "Farmersville", "Woodlake", "Lemoore", "Corcoran", "Avenal",
];
