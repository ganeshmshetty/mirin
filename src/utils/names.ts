const ADJECTIVES = [
  "Sleek", "Zippy", "Swift", "Radiant", "Dashing", "Bold", "Bright", "Snappy", "Polite",
  "Mellow", "Friendly", "Nimble", "Gentle", "Happy", "Chippy", "Plucky", "Clever", "Jolly",
  "Brave", "Calm", "Eager", "Fancy", "Grand", "Kind", "Lively", "Quiet", "Proud", "Silly",
  "Witty", "Zealous", "Agile", "Drifty", "Frosty", "Sparky", "Cosmic", "Lunar", "Solar",
  "Stellar", "Quantum", "Sonic", "Turbo", "Hyper", "Alpha", "Apex", "Nova", "Epic", "Neon",
  "Vivid", "Glow",
];

const ANIMALS = [
  "Otter", "Panda", "Fox", "Falcon", "Eagle", "Dolphin", "Penguin", "Rabbit", "Squirrel",
  "Tiger", "Lion", "Leopard", "Koala", "Cheetah", "Jaguar", "Panther", "Wolf", "Bear", "Deer",
  "Elk", "Moose", "Bison", "Badger", "Beaver", "Hedgehog", "Hamster", "Lemur", "Meerkat",
  "Sloth", "Wombat", "Platypus", "Kangaroo", "Wallaby", "Hawk", "Owl", "Raven", "Swan", "Heron",
  "Lynx", "Puma", "Ocelot", "Caracal", "Serval", "Ibex", "Orca", "Seal",
];

export function getDeterministicName(serial: string): string {
  // Stable FNV-1a 32-bit hash matching Rust
  let hash = 2166136261;
  for (let i = 0; i < serial.length; i++) {
    hash ^= serial.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  const adjIdx = hash % ADJECTIVES.length;
  const animalIdx = (hash >>> 8) % ANIMALS.length;

  return `${ADJECTIVES[adjIdx]} ${ANIMALS[animalIdx]}`;
}
