import test from 'node:test';
import assert from 'node:assert/strict';
import { completedVideo } from '../index.js';
test('only confirmed completion with a valid video URL succeeds', () => {
  assert.equal(completedVideo({status:'completed',video:{url:'https://example.com/video.mp4'}}),'https://example.com/video.mp4');
  for (const status of ['failed','canceled','cancelled','nsfw','moderated','queued','in_progress',undefined]) {
    assert.throws(()=>completedVideo({status,video:{url:'https://example.com/video.mp4'}}));
  }
  for (const url of [undefined,'not-a-url','http://example.com/video','https://user:secret@example.com/video']) {
    assert.throws(()=>completedVideo({status:'completed',video:{url}}));
  }
});
