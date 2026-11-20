#pragma once

#include <cstdint>
#include <random>

namespace Aurora::Contracts
{
  // Portable index pick in [0, n) from mt19937's specified raw output.
  // std::uniform_int_distribution's mapping differs across standard libraries.
  inline std::uint32_t pickIndex(std::mt19937& rng, std::uint32_t n)
  {
    if(n == 0){
      return 0;
    }
    // Lemire multiply-shift with rejection (unbiased).
    std::uint64_t product = static_cast<std::uint64_t>(static_cast<std::uint32_t>(rng())) * n;
    std::uint32_t low = static_cast<std::uint32_t>(product);
    if(low < n){
      const std::uint32_t threshold = (0u - n) % n;
      while(low < threshold){
        product = static_cast<std::uint64_t>(static_cast<std::uint32_t>(rng())) * n;
        low = static_cast<std::uint32_t>(product);
      }
    }
    return static_cast<std::uint32_t>(product >> 32);
  }
}
