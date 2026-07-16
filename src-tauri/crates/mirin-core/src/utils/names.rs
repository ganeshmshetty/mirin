use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

const ADJECTIVES: &[&str] = &[
    "Sleek", "Zippy", "Swift", "Radiant", "Dashing", "Bold", "Bright", "Snappy",
    "Polite", "Mellow", "Friendly", "Nimble", "Gentle", "Happy", "Chippy", "Plucky",
    "Clever", "Jolly", "Brave", "Calm", "Eager", "Fancy", "Grand", "Kind",
    "Lively", "Quiet", "Proud", "Silly", "Witty", "Zealous", "Agile", "Drifty",
    "Frosty", "Sparky", "Cosmic", "Lunar", "Solar", "Stellar", "Quantum", "Sonic",
    "Turbo", "Hyper", "Alpha", "Apex", "Nova", "Epic", "Neon", "Vivid", "Glow"
];

const ANIMALS: &[&str] = &[
    "Otter", "Panda", "Fox", "Falcon", "Eagle", "Dolphin", "Penguin", "Rabbit",
    "Squirrel", "Tiger", "Lion", "Leopard", "Koala", "Cheetah", "Jaguar", "Panther",
    "Wolf", "Bear", "Deer", "Elk", "Moose", "Bison", "Badger", "Beaver",
    "Hedgehog", "Hamster", "Lemur", "Meerkat", "Sloth", "Wombat", "Platypus",
    "Kangaroo", "Wallaby", "Hawk", "Owl", "Raven", "Swan", "Heron", "Lynx",
    "Puma", "Ocelot", "Caracal", "Serval", "Ibex", "Orca", "Seal"
];

pub fn get_deterministic_name(serial: &str) -> String {
    let mut hasher = DefaultHasher::new();
    serial.hash(&mut hasher);
    let hash_value = hasher.finish();

    let adj_idx = (hash_value as usize) % ADJECTIVES.len();
    let animal_idx = ((hash_value >> 8) as usize) % ANIMALS.len();

    format!("{} {}", ADJECTIVES[adj_idx], ANIMALS[animal_idx])
}
