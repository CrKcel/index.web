import assert from 'node:assert/strict';
import {InstancedBufferAttribute} from 'three';
import {InstanceUpdates} from '../src/instance-updates.ts';
import {RenderState} from '../src/render-state.ts';

// Uniform uploads are skipped when nothing changed; float noise below the GPU's
// own precision must not count as a change.
const attribute=new InstancedBufferAttribute(new Float32Array(64),16);
const updates=new InstanceUpdates(attribute);
updates.scalar(4,.1);assert.equal(updates.commit(),true);
const version=attribute.version;
updates.scalar(4,.1+1e-10);assert.equal(updates.commit(),false);assert.equal(attribute.version,version);

const state=new RenderState();
const sample=(...values)=>{state.begin();for(const value of values)typeof value==='number'?state.floats(value):state.add(value);return state.end();};
assert.equal(sample(1,.1,'texture',undefined),true);
assert.equal(sample(1,.1+1e-10,'texture',undefined),false);
assert.equal(sample(1,.100001,'texture',undefined),true);
assert.equal(sample(1,.100001,'new texture',undefined),true);
// An object that disappears from the render list must invalidate the next frame
// instead of leaving its last values applied.
assert.equal(sample(1,.100001),true,'Removed objects invalidate');
assert.equal(sample(1,.100001),false);
// Resize and WebGL context restoration invalidate everything.
state.invalidate();assert.equal(sample(1,.100001),true,'Resize and context restoration invalidate');
// Version counters keep counting past float32's exact integer range.
state.begin();state.add(16777216);state.end();state.begin();state.add(16777217);assert.equal(state.end(),true,'Version counters retain integer precision');
console.log('GPU value comparison, texture changes, removed objects and explicit invalidation passed.');
