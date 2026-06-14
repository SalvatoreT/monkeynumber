//! monkeynumber — find a Mersenne-Twister seed `S` such that
//! `ruby -e "srand(S);puts L.times.map{rand(97..123).chr}.join"` prints a target word.
//!
//! The RNG is a hand-rolled MT19937 that is bit-exact with Ruby's `srand`/`rand`
//! (standard `init_genrand` seeding + `genrand_int32` tempering) and with the
//! `pigulla/mersennetwister` JS library the original site used. Letters are drawn
//! with `genrand_int32() & 31`, rejecting values `> 26` — the same rejection
//! sampling Ruby's `rand(97..123)` performs.

use wasm_bindgen::prelude::*;

const N: usize = 624;
const M: usize = 397;
const MATRIX_A: u32 = 0x9908_b0df;
const UPPER_MASK: u32 = 0x8000_0000;
const LOWER_MASK: u32 = 0x7fff_ffff;

/// Standard MT19937 (32-bit).
pub struct Mt19937 {
    mt: [u32; N],
    mti: usize,
}

impl Mt19937 {
    /// Create an unseeded generator (call `init_genrand` before use).
    pub fn new() -> Self {
        Mt19937 {
            mt: [0u32; N],
            mti: N + 1,
        }
    }

    /// Seed from a single 32-bit integer (Knuth's `init_genrand`).
    #[inline]
    pub fn init_genrand(&mut self, seed: u32) {
        self.mt[0] = seed;
        let mut i = 1;
        while i < N {
            let prev = self.mt[i - 1];
            self.mt[i] = 1_812_433_253u32
                .wrapping_mul(prev ^ (prev >> 30))
                .wrapping_add(i as u32);
            i += 1;
        }
        self.mti = N;
    }

    /// Next 32-bit output (`genrand_int32`).
    #[inline]
    pub fn genrand_int32(&mut self) -> u32 {
        if self.mti >= N {
            self.generate_block();
        }
        let mut y = self.mt[self.mti];
        self.mti += 1;
        // Tempering.
        y ^= y >> 11;
        y ^= (y << 7) & 0x9d2c_5680;
        y ^= (y << 15) & 0xefc6_0000;
        y ^= y >> 18;
        y
    }

    #[inline]
    fn generate_block(&mut self) {
        const MAG01: [u32; 2] = [0, MATRIX_A];
        let mut kk = 0;
        while kk < N - M {
            let y = (self.mt[kk] & UPPER_MASK) | (self.mt[kk + 1] & LOWER_MASK);
            self.mt[kk] = self.mt[kk + M] ^ (y >> 1) ^ MAG01[(y & 1) as usize];
            kk += 1;
        }
        while kk < N - 1 {
            let y = (self.mt[kk] & UPPER_MASK) | (self.mt[kk + 1] & LOWER_MASK);
            self.mt[kk] = self.mt[kk + M - N] ^ (y >> 1) ^ MAG01[(y & 1) as usize];
            kk += 1;
        }
        let y = (self.mt[N - 1] & UPPER_MASK) | (self.mt[0] & LOWER_MASK);
        self.mt[N - 1] = self.mt[M - 1] ^ (y >> 1) ^ MAG01[(y & 1) as usize];
        self.mti = 0;
    }

    /// One letter index in `0..=26`, mirroring Ruby's `rand(97..123) - 97`
    /// (5 low bits, reject values above 26).
    #[inline]
    pub fn limited_rand(&mut self) -> u32 {
        loop {
            let v = self.genrand_int32() & 31;
            if v <= 26 {
                return v;
            }
        }
    }
}

impl Default for Mt19937 {
    fn default() -> Self {
        Self::new()
    }
}

/// Does the MT stream seeded by `seed` begin with exactly `target`?
#[inline]
fn seed_matches(mt: &mut Mt19937, seed: u32, target: &[u8]) -> bool {
    mt.init_genrand(seed);
    for &t in target {
        if mt.limited_rand() != t as u32 {
            return false;
        }
    }
    true
}

/// Scan up to `batch` seeds starting at `start`, stepping by `stride`.
/// Returns the first seed whose output stream begins with `target`, or `None`.
///
/// Workers cover disjoint slices of the u32 seed space by choosing distinct
/// `start` values and a shared `stride` (= worker count). `start` wraps modulo
/// 2^32, matching the original site's behaviour.
#[wasm_bindgen]
pub fn search(target: &[u8], start: u32, stride: u32, batch: u32) -> Option<u32> {
    let mut mt = Mt19937::new();
    let mut seed = start;
    for _ in 0..batch {
        if seed_matches(&mut mt, seed, target) {
            return Some(seed);
        }
        seed = seed.wrapping_add(stride);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Canonical MT19937 reference outputs, cross-checked against Ruby 2.7.6:
    /// `srand(5489); rand(2**32)` == 3499211612, `srand(0); rand(2**32)` == 2357136044.
    #[test]
    fn reference_vectors() {
        let mut mt = Mt19937::new();
        mt.init_genrand(5489);
        assert_eq!(mt.genrand_int32(), 3_499_211_612);

        mt.init_genrand(0);
        assert_eq!(mt.genrand_int32(), 2_357_136_044);
    }

    /// Ruby ground truth: `srand(0); 8.times.map{rand(97..123).chr}.join` == "mpvaddhj".
    #[test]
    fn ruby_letter_stream() {
        let mut mt = Mt19937::new();
        mt.init_genrand(0);
        let got: Vec<u32> = (0..8).map(|_| mt.limited_rand()).collect();
        assert_eq!(got, vec![12, 15, 21, 0, 3, 3, 7, 9]); // m p v a d d h j
    }

    /// `search` should rediscover seed 0 for the prefix of "mpvaddhj".
    #[test]
    fn search_finds_known_seed() {
        let target = [12u8, 15, 21]; // "mpv"
        // Stride 1 from 0 must hit seed 0 immediately.
        assert_eq!(search(&target, 0, 1, 10), Some(0));
    }

    /// A non-matching first byte abandons the seed (prefix semantics).
    #[test]
    fn search_respects_prefix() {
        let target = [0u8]; // "a"
        // seed 0's first letter is 'm' (12), not 'a' (0), so seed 0 is rejected;
        // some later seed produces 'a' first.
        let found = search(&target, 0, 1, 1000).expect("a single-letter target must be findable");
        let mut mt = Mt19937::new();
        assert!(seed_matches(&mut mt, found, &target));
        assert_ne!(found, 0);
    }
}
