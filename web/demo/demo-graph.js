// Demo answers for GET /api/graph and GET /api/nodes so the ported Tuning
// section renders the same controls as the daemon (Aurora-id8j.10). Hand-mirrors
// core's builtInVideoGraph/builtInAudioGraph `controls` and the control-bearing
// node types; slider ranges come from the descriptor params, the daemon's
// source for the same schema. Only nodes that carry controls are listed.

const FLOAT_PARAM = (name, descriptorKey, descriptors, description) => {
  const param = descriptors.find((d) => d.key === descriptorKey)?.param;
  return param ? { name, kind: 'float', description, label: param.label, min: param.min, max: param.max, step: param.step, unit: param.unit, default: param.default, allowsUnset: false } : null;
};

function nodeTypes(descriptors) {
  const audio = (name, key) => FLOAT_PARAM(name, `audio.${key}`, descriptors, '');
  const fixedHue = descriptors.find((d) => d.key === 'audio.fixedAnchorHue')?.param;
  return [
    {
      type: 'image.rescale',
      params: [
        { name: 'width', kind: 'float', description: '', label: 'Resample width', min: 0, max: 7680, step: 1, unit: 'px', default: 0, allowsUnset: false },
        { name: 'interpolation', kind: 'enum', description: '', options: ['Nearest', 'Cubic', 'Area'], default: 'Area' },
      ],
    },
    { type: 'frame.smooth', params: [FLOAT_PARAM('smoothing', 'video.transitionSmoothing', descriptors, '')] },
    {
      type: 'audio.drift',
      params: [
        fixedHue && { name: 'fixedAnchorHue', kind: 'optional-float', description: '', label: fixedHue.label, min: fixedHue.min, max: fixedHue.max, step: fixedHue.step, unit: fixedHue.unit, default: fixedHue.default, allowsUnset: true },
        audio('driftBaseRateDegPerSec', 'driftBaseRateDegPerSec'),
        audio('centroidStrength', 'centroidStrength'),
        audio('centroidRangeHz', 'centroidRangeHz'),
      ].filter(Boolean),
    },
    {
      type: 'audio.bounce',
      params: [
        audio('bounceSmoothTime', 'bounceSmoothTime'),
        audio('dynamismFloor', 'dynamismFloor'),
        audio('vibrancySaturation', 'vibrancySaturation'),
        audio('vibrancyValue', 'vibrancyValue'),
        audio('referenceRms', 'referenceRms'),
        audio('brightnessFloor', 'brightnessFloor'),
        audio('brightnessSmoothTime', 'brightnessSmoothTime'),
      ].filter(Boolean),
    },
  ];
}

const control = (node, param, config, section) => (section ? { node, param, config, section } : { node, param, config });

export function demoGraph(config) {
  const audio = !config.activeInputName && !!config.activeAudioInputName;
  if (!audio) {
    return {
      version: 1,
      nodes: [
        { id: 'rescale', type: 'image.rescale', params: { width: config.subsampleWidth, interpolation: config.interpolation } },
        { id: 'ease_hue', type: 'frame.smooth', params: { smoothing: config.transitionSmoothing } },
      ],
      edges: [],
      controls: [
        control('rescale', 'width', 'subsampleWidth'),
        control('rescale', 'interpolation', 'interpolation'),
        control('ease_hue', 'smoothing', 'transitionSmoothing'),
      ],
    };
  }
  return {
    version: 1,
    tickHz: 60,
    nodes: [
      {
        id: 'drift',
        type: 'audio.drift',
        params: {
          fixedAnchorHue: config.audioFixedAnchorHue >= 0 ? config.audioFixedAnchorHue : null,
          driftBaseRateDegPerSec: config.audioDriftBaseRateDegPerSec,
          centroidStrength: config.audioCentroidStrength,
          centroidRangeHz: config.audioCentroidRangeHz,
        },
      },
      {
        id: 'beat',
        type: 'audio.bounce',
        params: {
          bounceSmoothTime: config.audioBounceSmoothTime,
          dynamismFloor: config.audioDynamismFloor,
          vibrancySaturation: config.audioVibrancySaturation,
          vibrancyValue: config.audioVibrancyValue,
          referenceRms: config.audioReferenceRms,
          brightnessFloor: config.audioBrightnessFloor,
          brightnessSmoothTime: config.audioBrightnessSmoothTime,
        },
      },
    ],
    edges: [],
    controls: [
      control('beat', 'bounceSmoothTime', 'audioBounceSmoothTime', 'Response speed'),
      control('beat', 'brightnessSmoothTime', 'audioBrightnessSmoothTime', 'Response speed'),
      control('drift', 'driftBaseRateDegPerSec', 'audioDriftBaseRateDegPerSec', 'Response speed'),
      control('beat', 'vibrancySaturation', 'audioVibrancySaturation', 'Color character'),
      control('beat', 'vibrancyValue', 'audioVibrancyValue', 'Color character'),
      control('drift', 'fixedAnchorHue', 'audioFixedAnchorHue', 'Color character'),
      control('beat', 'dynamismFloor', 'audioDynamismFloor', 'Sensitivity'),
      control('drift', 'centroidStrength', 'audioCentroidStrength', 'Sensitivity'),
      control('beat', 'referenceRms', 'audioReferenceRms', 'Sensitivity'),
      control('beat', 'brightnessFloor', 'audioBrightnessFloor', 'Sensitivity'),
      control('drift', 'centroidRangeHz', 'audioCentroidRangeHz', 'Sensitivity'),
    ],
  };
}

export function demoNodes(descriptors) {
  return { nodes: nodeTypes(descriptors) };
}
