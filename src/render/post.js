import * as THREE from 'three/webgpu';
import { pass, mrt, output, emissive, normalView, screenUV, builtinAOContext, uniform, vec4, float } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';

// Quality tiers: high = GTAO (contact shadows between bricks) + bloom (flames) + 4x MSAA, optional macro DOF;
// medium = bloom + MSAA; low = direct render. Tiers are switched by the adaptive governor or by Q.
export const TIERS = ['low', 'medium', 'high'];

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.tier = 'high';
    this.dofOn = false;
    this.focus = uniform(6);
    this.pipelines = {};
  }

  build(tier) {
    if (this.pipelines[tier] !== undefined) return this.pipelines[tier];
    const { renderer, scene, camera } = this;
    let pipe = null;
    if (tier === 'high') {
      pipe = new THREE.RenderPipeline(renderer);
      const pre = pass(scene, camera);
      pre.setMRT(mrt({ output: normalView }));
      const preNormal = pre.getTextureNode();
      const preDepth = pre.getTextureNode('depth');
      const aoPass = ao(preDepth, preNormal, camera);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = 0.55;
      aoPass.thickness.value = 0.6;
      aoPass.scale.value = 1.15;
      aoPass.samples.value = 12;
      const scenePass = pass(scene, camera, { samples: 4 });
      scenePass.setMRT(mrt({ output, emissive }));
      scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
      const color = scenePass.getTextureNode('output');
      const glowPass = bloom(scenePass.getTextureNode('emissive'), 1.1, 0.45, 0.0);
      let out = color.add(glowPass);
      this.highScene = scenePass;
      this.highOut = out;
      pipe.outputNode = out;
      this.aoPass = aoPass;
    } else if (tier === 'medium') {
      pipe = new THREE.RenderPipeline(renderer);
      const scenePass = pass(scene, camera, { samples: 4 });
      scenePass.setMRT(mrt({ output, emissive }));
      const color = scenePass.getTextureNode('output');
      pipe.outputNode = color.add(bloom(scenePass.getTextureNode('emissive'), 1.0, 0.4, 0.0));
    }
    this.pipelines[tier] = pipe;
    return pipe;
  }

  // macro depth of field for photo mode (high tier only)
  setDof(on) {
    if (this.tier !== 'high' || !this.highScene) return;
    this.dofOn = on;
    const pipe = this.pipelines.high;
    if (on) {
      const viewZ = this.highScene.getViewZNode();
      pipe.outputNode = dof(this.highOut, viewZ, this.focus, 3.0, 1.6);
    } else pipe.outputNode = this.highOut;
    pipe.needsUpdate = true;
  }

  setTier(t) { this.tier = t; this.build(t); }

  render() {
    const pipe = this.build(this.tier);
    if (pipe) pipe.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
