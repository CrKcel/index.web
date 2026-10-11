import assert from "node:assert/strict";
import { viewportLayout, openingLayout, archiveFraming } from "../src/viewport-layout.ts";
import { renderDimensions, renderQuality } from "../src/render-quality.ts";

for (const [w,h,touch] of [[1920,1080,false],[2560,1080,false],[1280,1024,false],[844,390,true],[390,844,true],[320,568,true]]) {
  const layout=viewportLayout(w,h,touch);
  assert.ok(Math.abs(layout.width*layout.scale-w)<1e-8);
  assert.ok(Math.abs(layout.height*layout.scale-h)<1e-8);
  const opening=openingLayout(w,h);
  assert.ok(Math.abs(opening.width*opening.scale-w)<1e-8 && Math.abs(opening.height*opening.scale-h)<1e-8,'Opening fills the viewport');
  assert.ok(opening.width>=1279.99 && opening.height>=1079.99,'Central login content fits without stretching');
  const shot=archiveFraming(layout.width,layout.height,7.33,1,layout.kind==='compact');
  assert.ok(shot.span>=5.9&&shot.detailX>0&&shot.detailX<1&&shot.detailY>0&&shot.detailY<1);
  if(layout.kind==='portrait') {
    const coverHeight=3.7*h/shot.span;
    assert.ok(shot.detailY*h-coverHeight/2>=110, 'Cover clears the return control on short phones');
    assert.ok(shot.detailY*h+coverHeight/2<=h*.54-40, 'Cover clears the document header');
  }
  const render=renderDimensions(renderQuality,layout.width,layout.height,layout.scale,3,16384);
  assert.ok(render.width>=w, 'CSS-sized phones must not retain the old 1920px scale factor');
  assert.ok(render.width*render.height<=8294400+5000);
}

// Scale factor, device ratio and driver texture limits all have to stay inside
// the fill-rate budget, including the stages a 4K-class window can request.
for (const scale of [1, 2, 4]) {
  for (const dpr of [1, 1.5, 2, 3]) {
    for (const max of [2048, 4096, 16384]) {
      const dimensions=renderDimensions(renderQuality,1920,1080,scale,dpr,max);
      assert.ok(dimensions.ratio>0);
      assert.ok(dimensions.width*dimensions.height<=8294400, `${scale}×${dpr}@${max} exceeded the pixel budget`);
      assert.ok(dimensions.width<=max&&dimensions.height<=max, `${scale}×${dpr}@${max} exceeded the texture limit`);
    }
  }
}
assert.deepEqual(viewportLayout(1920,1080,false),{width:1920,height:1080,scale:1,kind:'desktop'});
assert.equal(archiveFraming(1920,1080,7.33,1,false).span,5.9);
assert.equal(archiveFraming(1920,1080,7.33,1,false).detailX,550/1920);
console.log('Viewport, reference framing and render resolution checks passed.');
