/** R&S target categories → Getlead NAICS prefix filters (GetLeads matches naics_codes by prefix). */
export const TARGET_CATEGORIES: Array<{ label: string; naics: string[]; default?: boolean }> = [
  { label: "Medical offices", naics: ["6211", "6213"], default: true },
  { label: "Dental offices", naics: ["621210"], default: true },
  { label: "Clinics", naics: ["6214", "6215"], default: true },
  { label: "Office buildings", naics: ["531120", "5312"], default: true },
  { label: "Property management", naics: ["531311", "531312"], default: true },
  { label: "Warehouses", naics: ["4931", "531130"], default: true },
  { label: "Distribution centers", naics: ["4921", "4841", "42"] },
  { label: "Manufacturing / industrial", naics: ["31", "32", "33"] },
  { label: "Schools", naics: ["6111"] },
  { label: "Churches", naics: ["8131"] },
  { label: "Gyms / fitness", naics: ["71394"] },
  { label: "Auto dealerships", naics: ["4411"] },
  { label: "Daycares", naics: ["624410"] },
  { label: "HOAs", naics: ["813990"] },
  { label: "Facilities management", naics: ["561210"] },
  { label: "Professional offices (legal, accounting, insurance)", naics: ["5411", "5412", "5242"] },
];

export const DEFAULT_CITIES = ["Bakersfield", "Fresno", "Visalia", "Delano", "Shafter", "Wasco", "Tulare", "Hanford"];
export const DEFAULT_TITLES = ["Facilities Manager", "Director of Facilities", "Property Manager", "Building Manager", "Operations Manager", "Director of Operations", "Office Manager", "General Manager", "Asset Manager", "Owner", "Practice Manager"];
