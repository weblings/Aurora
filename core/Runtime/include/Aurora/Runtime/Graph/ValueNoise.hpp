#pragma once

#include <cmath>
#include <cstdint>

// Smooth 1D value noise shared by the `noise` and `image.noise` nodes. Pure
// functions of (lattice index, seed), so equal inputs always give equal output.
namespace Aurora::Runtime::Graph::ValueNoise
{
  // Integer hash to [0, 1).
  inline float hash(uint32_t a, uint32_t b, uint32_t seed)
  {
    uint32_t h = seed * 0x9E3779B1u + a * 0x85EBCA6Bu + b * 0xC2B2AE35u;
    h ^= h >> 16;
    h *= 0x7FEB352Du;
    h ^= h >> 15;
    h *= 0x846CA68Bu;
    h ^= h >> 16;
    return static_cast<float>(h >> 8) / 16777216.f;
  }

  // Lattice values hash(i, key) blended with smoothstep; t is in lattice units.
  inline float sample(double t, uint32_t key, uint32_t seed)
  {
    double base = std::floor(t);
    float f = static_cast<float>(t - base);
    float s = f * f * (3.f - 2.f * f);
    uint32_t i = static_cast<uint32_t>(static_cast<int64_t>(base));
    float a = hash(i, key, seed);
    float b = hash(i + 1u, key, seed);
    return a + (b - a) * s;
  }
}
