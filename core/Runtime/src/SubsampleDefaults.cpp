#include <Aurora/Runtime/SubsampleDefaults.hpp>

namespace Aurora::Runtime
{
  int pickDefaultSubsampleWidth(
    const std::vector<glm::ivec2>& subsampleCandidates,
    int displayWidth,
    float percentThreshold
  )
  {
    if(subsampleCandidates.empty()){
      return 0;
    }

    // Candidates run largest-to-smallest width (see IVideoInput::subsampleResolutionCandidates);
    // walk in reverse (smallest first) so the first hit is the cheapest one that qualifies.
    int best = subsampleCandidates.back().x;

    for(auto it = subsampleCandidates.rbegin(); it != subsampleCandidates.rend(); ++it){
      if((static_cast<float>(it->x) / static_cast<float>(displayWidth)) * 100.f >= percentThreshold){
        best = it->x;
        break;
      }
    }

    return best;
  }
}
