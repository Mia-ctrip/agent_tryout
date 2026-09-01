import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FACE_ANALYSIS_STATUSES,
  analysisStageForTargets,
  captureGuidanceCopy,
  createFaceAnalysisState,
  faceAnalysisReducer,
  liveGuidanceFromQuality,
  photoRecoveryPrimaryLabel,
  regionSelectionCta,
} from '../src/lib/face-analysis-flow.ts';

test('state catalog covers every requested capture, quality and analysis state', () => {
  assert.deepEqual(FACE_ANALYSIS_STATUSES, [
    'permission_required',
    'camera_starting',
    'camera_ready',
    'face_not_found',
    'multiple_faces',
    'face_too_far',
    'face_too_close',
    'face_off_angle',
    'poor_lighting',
    'unstable',
    'occluded',
    'ready_to_capture',
    'photo_captured',
    'quality_checking',
    'quality_failed',
    'selecting_regions',
    'confirming_events',
    'analyzing_quality',
    'analyzing_landmarks',
    'analyzing_regions',
    'generating_result',
    'success',
    'error',
  ]);
});

test('live quality samples map backend issues to the single highest-priority guidance', () => {
  const quality = (code) => ({
    status: 'failed',
    primary_issue: { code, message: code },
    issues: [{ code, message: code }],
    metrics: {},
    regions: [],
  });
  assert.equal(liveGuidanceFromQuality(quality('face_not_found')), 'face_not_found');
  assert.equal(liveGuidanceFromQuality(quality('multiple_faces')), 'multiple_faces');
  assert.equal(liveGuidanceFromQuality(quality('face_too_far')), 'face_too_far');
  assert.equal(liveGuidanceFromQuality(quality('face_too_close')), 'face_too_close');
  assert.equal(liveGuidanceFromQuality(quality('face_off_angle')), 'face_off_angle');
  assert.equal(liveGuidanceFromQuality(quality('poor_lighting')), 'poor_lighting');
  assert.equal(liveGuidanceFromQuality(quality('blurry')), 'unstable');
  assert.equal(liveGuidanceFromQuality(quality('occluded')), 'occluded');
  assert.equal(
    liveGuidanceFromQuality({ ...quality('blurry'), status: 'passed', primary_issue: null, issues: [] }),
    'ready_to_capture',
  );
});

test('retake clears temporary quality data but preserves request identity and choices', () => {
  let state = createFaceAnalysisState('stable-request');
  state = { ...state, photoUri: 'file://old.jpg', selectedRegions: ['chin'], activeRegion: 'chin' };
  state = faceAnalysisReducer(state, { type: 'retake' });
  assert.equal(state.clientRequestId, 'stable-request');
  assert.equal(state.photoUri, null);
  assert.equal(state.quality, null);
  assert.deepEqual(state.selectedRegions, ['chin']);
});

test('capture guidance returns one actionable message without color dependence', () => {
  assert.equal(captureGuidanceCopy('face_not_found').message, '请将脸移入框内');
  assert.equal(captureGuidanceCopy('face_too_far').message, '请靠近一点');
  assert.equal(captureGuidanceCopy('face_too_close').message, '请稍微远离镜头');
  assert.equal(captureGuidanceCopy('face_off_angle').message, '请正视镜头');
  assert.equal(captureGuidanceCopy('poor_lighting').message, '当前光线较暗');
  assert.equal(captureGuidanceCopy('unstable').message, '请保持稳定');
  assert.equal(captureGuidanceCopy('multiple_faces').message, '画面中请只保留一张脸');
  assert.equal(captureGuidanceCopy('occluded').message, '请移开头发、口罩或手部遮挡');
  assert.equal(captureGuidanceCopy('ready_to_capture').message, '状态良好，可以拍摄');
});

test('quality failure and analysis error preserve photo and selected regions for recovery', () => {
  let state = createFaceAnalysisState('request-id');
  state = faceAnalysisReducer(state, { type: 'permission_granted' });
  state = faceAnalysisReducer(state, { type: 'camera_started' });
  state = faceAnalysisReducer(state, { type: 'guidance_changed', status: 'ready_to_capture' });
  state = faceAnalysisReducer(state, {
    type: 'photo_captured',
    photoUri: 'file://face.jpg',
    source: 'camera',
  });
  state = faceAnalysisReducer(state, { type: 'quality_check_started' });
  state = faceAnalysisReducer(state, {
    type: 'quality_failed',
    issue: { code: 'blurry', message: '照片有些模糊，请保持手机稳定' },
  });
  assert.equal(state.status, 'quality_failed');
  assert.equal(state.photoUri, 'file://face.jpg');

  state = faceAnalysisReducer(state, {
    type: 'quality_passed',
    quality: { status: 'passed', primary_issue: null, issues: [], metrics: {}, regions: [] },
  });
  state = faceAnalysisReducer(state, { type: 'region_toggled', regionId: 'right_face' });
  state = faceAnalysisReducer(state, { type: 'analysis_started' });
  const duplicate = faceAnalysisReducer(state, { type: 'analysis_started' });
  assert.equal(duplicate, state);
  state = faceAnalysisReducer(state, { type: 'analysis_failed', message: '网络异常，请重试' });
  assert.equal(state.status, 'error');
  assert.equal(state.photoUri, 'file://face.jpg');
  assert.deepEqual(state.selectedRegions, ['right_face']);
});

test('photo source survives quality failure and selects the matching recovery action', () => {
  let state = createFaceAnalysisState('library-request');
  state = faceAnalysisReducer(state, {
    type: 'photo_captured',
    photoUri: 'file://phone-photo.jpg',
    source: 'library',
  });
  state = faceAnalysisReducer(state, { type: 'quality_check_started' });
  state = faceAnalysisReducer(state, {
    type: 'quality_failed',
    issue: { code: 'blurry', message: '照片有些模糊' },
  });

  assert.equal(state.photoSource, 'library');
  assert.equal(photoRecoveryPrimaryLabel(state.photoSource), '重新选择照片');
  assert.equal(photoRecoveryPrimaryLabel('camera'), '重新拍摄');

  state = faceAnalysisReducer(state, { type: 'retake' });
  assert.equal(state.photoSource, null);
});

test('required regions stay selected while every supported region remains selectable', () => {
  let state = createFaceAnalysisState('request-id', ['forehead']);
  state = faceAnalysisReducer(state, {
    type: 'quality_passed',
    quality: { status: 'passed', primary_issue: null, issues: [], metrics: {}, regions: [] },
  });
  state = faceAnalysisReducer(state, { type: 'region_toggled', regionId: 'forehead' });
  assert.deepEqual(state.selectedRegions, ['forehead']);
  state = faceAnalysisReducer(state, { type: 'region_toggled', regionId: 'chin' });
  state = faceAnalysisReducer(state, { type: 'region_toggled', regionId: 'nose_area' });
  state = faceAnalysisReducer(state, { type: 'region_toggled', regionId: 'mouth_area' });
  state = faceAnalysisReducer(state, { type: 'region_toggled', regionId: 'left_face' });
  state = faceAnalysisReducer(state, { type: 'region_toggled', regionId: 'right_face' });
  assert.deepEqual(state.selectedRegions, [
    'forehead',
    'left_face',
    'right_face',
    'nose_area',
    'mouth_area',
    'chin',
  ]);
});

test('region CTA describes empty, single and multiple selections', () => {
  assert.equal(regionSelectionCta([]), '请选择检测区域');
  assert.equal(regionSelectionCta(['right_face']), '检测右脸颊');
  assert.equal(regionSelectionCta(['forehead', 'chin']), '检测 2 个区域');
});

test('target stages reflect real queued, processing, partial and terminal states', () => {
  const target = (status, region_id = 'forehead') => ({ status, region_id });
  assert.equal(analysisStageForTargets([target('queued')]).status, 'analyzing_landmarks');
  assert.equal(analysisStageForTargets([target('processing')]).status, 'analyzing_regions');
  assert.equal(
    analysisStageForTargets([target('completed'), target('processing', 'chin')]).status,
    'generating_result',
  );
  assert.equal(analysisStageForTargets([target('completed')]).status, 'success');
  assert.equal(analysisStageForTargets([target('needs_input')]).status, 'error');
});
