/**
 * Multimedia processing tools — image, video, audio processing.
 * Uses ffmpeg, ImageMagick, and other CLI tools via shell execution.
 * Provides graceful fallback when tools are not installed.
 */

import { execShell } from '../shell/shell-exec.js';

// ── Tool detection ──

const _toolCache = new Map();

async function findTool(name) {
  if (_toolCache.has(name)) return _toolCache.get(name);
  try {
    await execShell(`which "${name}"`, { timeoutMs: 2000 });
    _toolCache.set(name, true);
    return true;
  } catch {
    _toolCache.set(name, false);
    return false;
  }
}

function requireTool(name, installHint) {
  if (!_toolCache.get(name)) {
    throw new Error(`需要 ${name} 工具。${installHint}`);
  }
}

const INSTALL_HINTS = {
  ffmpeg: '请安装 ffmpeg:\n  macOS: brew install ffmpeg\n  Ubuntu: sudo apt install ffmpeg\n  Windows: winget install ffmpeg',
  magick: '请安装 ImageMagick:\n  macOS: brew install imagemagick\n  Ubuntu: sudo apt install imagemagick',
  sox: '请安装 SoX:\n  macOS: brew install sox\n  Ubuntu: sudo apt install sox',
};

// ── Image Processing ──

/**
 * Get image info (dimensions, format, size).
 */
export async function imageInfo({ path }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const r = await execShell(`ffprobe -v quiet -print_format json -show_format -show_streams "${path}"`, { timeoutMs: 10000 });
  const data = JSON.parse(r.stdout);
  const stream = (data.streams || []).find(s => s.codec_type === 'video');
  return {
    ok: true,
    data: {
      path,
      format: data.format?.format_name || '',
      size: parseInt(data.format?.size || '0'),
      width: stream?.width || 0,
      height: stream?.height || 0,
      codec: stream?.codec_name || '',
      bitrate: parseInt(data.format?.bit_rate || '0'),
      duration: parseFloat(data.format?.duration || '0'),
    },
  };
}

/**
 * Convert image between formats (png, jpg, webp, gif, bmp, tiff).
 */
export async function imageConvert({ input, output, quality }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const args = ['-y', '-i', `"${input}"`];
  if (quality != null) args.push('-quality', String(quality));
  args.push(`"${output}"`);
  await execShell(`ffmpeg ${args.join(' ')}`, { timeoutMs: 30000 });
  return { ok: true, data: { input, output } };
}

/**
 * Resize/crop image with various strategies.
 * @param {string} path - source file
 * @param {Object} opts
 * @param {number} opts.width - target width
 * @param {number} opts.height - target height
 * @param {string} opts.mode - 'resize' | 'crop' | 'fit' | 'pad' (default 'resize')
 * @param {string} opts.output - output path (default: overwrite)
 */
export async function imageResize({ path, width, height, mode = 'resize', output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path;
  let vf;
  switch (mode) {
    case 'crop': vf = `crop=${width}:${height}`; break;
    case 'fit': vf = `scale='min(${width},iw)':'min(${height},ih)':force_original_aspect_ratio=decrease`; break;
    case 'pad': vf = `scale='min(${width},iw)':'min(${height},ih)':force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`; break;
    default: vf = `scale=${width}:${height}`;
  }
  await execShell(`ffmpeg -y -i "${path}" -vf "${vf}" "${out}"`, { timeoutMs: 60000 });
  return { ok: true, data: { input: path, output: out, width, height, mode } };
}

/**
 * Apply image filters.
 * @param {Object} opts
 * @param {string} opts.path - source file
 * @param {string} opts.filter - filter type: 'grayscale' | 'sepia' | 'negate' | 'blur' | 'sharpen' | 'edge' | 'emboss'
 * @param {number} [opts.intensity] - filter intensity (0-100)
 * @param {string} [opts.output] - output path
 */
export async function imageFilter({ path, filter, intensity = 50, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path;
  const filterMap = {
    grayscale: 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3',
    sepia: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
    negate: 'negate',
    blur: `boxblur=${intensity / 50}:${intensity / 50}`,
    sharpen: `unsharp=${intensity / 25}:${intensity / 25}:${intensity / 10}:${intensity / 25}:${intensity / 25}:${intensity / 10}`,
    edge: 'edgedetect=low=0.1:high=0.3',
    emboss: 'convolution=-2,-1,0,-1,1,1,0,1,2',
  };
  const vf = filterMap[filter];
  if (!vf) throw new Error(`不支持的滤镜: ${filter}。支持: ${Object.keys(filterMap).join(', ')}`);
  await execShell(`ffmpeg -y -i "${path}" -vf "${vf}" "${out}"`, { timeoutMs: 60000 });
  return { ok: true, data: { input: path, output: out, filter } };
}

/**
 * Image compression/optimization.
 */
export async function imageCompress({ path, quality = 80, maxWidth, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path;
  const vf = maxWidth ? `scale='min(${maxWidth},iw)':-2` : null;
  const args = ['-y', '-i', `"${path}"`, '-quality', String(quality)];
  if (vf) args.push('-vf', `"${vf}"`);
  args.push(`"${out}"`);
  await execShell(`ffmpeg ${args.join(' ')}`, { timeoutMs: 60000 });
  return { ok: true, data: { input: path, output: out, quality, maxWidth } };
}

/**
 * Watermark an image with another image or text.
 */
export async function imageWatermark({ path, watermark, position = 'bottom-right', opacity = 0.7, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path;
  const posMap = {
    'top-left': '10:10',
    'top-right': 'W-w-10:10',
    'bottom-left': '10:H-h-10',
    'bottom-right': 'W-w-10:H-h-10',
    center: '(W-w)/2:(H-h)/2',
  };
  const pos = posMap[position] || posMap['bottom-right'];
  const vf = `movie='${watermark}'[water];[in][water]overlay=${pos}:format=auto,format=yuv420p[out]`;
  await execShell(`ffmpeg -y -i "${path}" -filter_complex "${vf}" "${out}"`, { timeoutMs: 60000 });
  return { ok: true, data: { input: path, output: out, position, opacity } };
}

// ── Video Processing ──

/**
 * Get video metadata (codec, resolution, duration, bitrate, fps).
 */
export async function videoInfo({ path }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const r = await execShell(`ffprobe -v quiet -print_format json -show_format -show_streams "${path}"`, { timeoutMs: 10000 });
  const data = JSON.parse(r.stdout);
  const vStream = (data.streams || []).find(s => s.codec_type === 'video') || {};
  const aStream = (data.streams || []).find(s => s.codec_type === 'audio') || {};
  const fpsParts = (vStream.r_frame_rate || '0/1').split('/');
  const fps = parseInt(fpsParts[0]) / (parseInt(fpsParts[1]) || 1);
  return {
    ok: true,
    data: {
      path,
      format: data.format?.format_name || '',
      size: parseInt(data.format?.size || '0'),
      duration: parseFloat(data.format?.duration || '0'),
      width: vStream.width || 0,
      height: vStream.height || 0,
      codec: vStream.codec_name || '',
      fps: isNaN(fps) ? 0 : Math.round(fps * 100) / 100,
      bitrate: parseInt(vStream.bit_rate || data.format?.bit_rate || '0'),
      audioCodec: aStream.codec_name || '',
      audioChannels: aStream.channels || 0,
      hasAudio: !!aStream.codec_name,
    },
  };
}

/**
 * Trim video segment.
 * @param {string} path - source file
 * @param {number|string} start - start time (seconds or "HH:MM:SS")
 * @param {number|string} [duration] - duration (omit to trim from start to end)
 * @param {number|string} [end] - end time (alternative to duration)
 * @param {string} [output] - output path
 */
export async function videoTrim({ path, start = 0, duration, end, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, '-trim$1');
  let args = ['-y', '-i', `"${path}"`];
  // Convert seconds to HH:MM:SS if numeric
  const fmtTime = (t) => typeof t === 'number' ? new Date(t * 1000).toISOString().substr(11, 8) : t;
  args.push('-ss', fmtTime(start));
  if (duration) args.push('-t', fmtTime(duration));
  else if (end) args.push('-to', fmtTime(end));
  args.push('-c', 'copy', `"${out}"`);
  await execShell(`ffmpeg ${args.join(' ')}`, { timeoutMs: 300000 });
  return { ok: true, data: { input: path, output: out, start, duration, end } };
}

/**
 * Concatenate multiple video files.
 */
export async function videoConcat({ files, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  // Create temp file list
  const fileList = files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
  await execShell(`echo "${fileList}" > /tmp/_vconcat.txt`, { timeoutMs: 2000 });
  await execShell(`ffmpeg -y -f concat -safe 0 -i /tmp/_vconcat.txt -c copy "${output}"`, { timeoutMs: 600000 });
  return { ok: true, data: { files, output } };
}

/**
 * Convert video format (mp4, mov, avi, mkv, webm, gif).
 */
export async function videoConvert({ input, output, codec, quality }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const args = ['-y', '-i', `"${input}"`];
  if (codec) args.push('-c:v', codec);
  if (quality != null) {
    if (output.endsWith('.gif')) {
      // GIF palette gen for quality
      args.push('-vf', `fps=10,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`);
    } else {
      args.push('-crf', String(Math.max(0, Math.min(51, 51 - Math.round(quality / 2)))));
    }
  }
  args.push(`"${output}"`);
  await execShell(`ffmpeg ${args.join(' ')}`, { timeoutMs: 600000 });
  return { ok: true, data: { input, output, codec } };
}

/**
 * Extract audio from video.
 */
export async function videoExtractAudio({ path, format = 'mp3', output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, `-audio.${format}`);
  await execShell(`ffmpeg -y -i "${path}" -vn -acodec libmp3lame -q:a 2 "${out}"`, { timeoutMs: 300000 });
  return { ok: true, data: { input: path, output: out, format } };
}

/**
 * Compress video (reduce file size).
 */
export async function videoCompress({ path, crf = 28, preset = 'medium', resolution, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, '-compressed$1');
  let vf = '';
  if (resolution) {
    const [w, h] = resolution.split(/x|:/).map(Number);
    vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`;
  }
  const args = ['-y', '-i', `"${path}"`, '-c:v', 'libx264', '-preset', preset, '-crf', String(crf)];
  if (vf) args.push('-vf', `"${vf}"`);
  args.push('-c:a', 'aac', '-b:a', '128k', `"${out}"`);
  await execShell(`ffmpeg ${args.join(' ')}`, { timeoutMs: 600000 });
  return { ok: true, data: { input: path, output: out, crf, preset, resolution } };
}

/**
 * Add subtitles to video.
 */
export async function videoAddSubtitles({ path, subtitles, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, '-sub$1');
  await execShell(`ffmpeg -y -i "${path}" -vf "subtitles=${subtitles}" "${out}"`, { timeoutMs: 300000 });
  return { ok: true, data: { input: path, output: out } };
}

/**
 * Change video speed.
 */
export async function videoSpeed({ path, speed = 1.0, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, `-x${speed}$1`);
  const setPts = `setpts=${1 / speed}*PTS`;
  const atempo = speed <= 2 ? `atempo=${speed}` : `atempo=2,atempo=${speed / 2}`;
  await execShell(`ffmpeg -y -i "${path}" -vf "${setPts}" -af "${atempo}" "${out}"`, { timeoutMs: 300000 });
  return { ok: true, data: { input: path, output: out, speed } };
}

// ── Advanced Video Editing ──

/**
 * Add transitions between clips or at clip boundaries.
 */
export async function videoTransition({ path, transition = 'fade', duration = 1, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, `-${transition}$1`);
  const filterMap = {
    fade: 'fade=t=in:st=0:d=' + duration,
    crossfade: `fade=t=out:st=${duration}:d=${duration}`,
    dissolve: `fade=t=in:st=0:d=${duration}`,
    wipe: `fade=t=in:st=0:d=${duration}`,
  };
  const vf = filterMap[transition] || filterMap.fade;
  await execShell(`ffmpeg -y -i "${path}" -vf "${vf}" "${out}"`, { timeoutMs: 300000 });
  return { ok: true, data: { input: path, output: out, transition, duration } };
}

/**
 * Overlay text on video.
 */
export async function videoTextOverlay({ path, text, position = 'bottom', fontSize = 24, color = 'white', output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, '-text$1');
  const posMap = {
    top: '10:(h-text_h-10)',
    'top-left': '10:10',
    top_right: 'w-tw-10:10',
    bottom: '10:(h-text_h-10)',
    'bottom-left': '10:h-th-10',
    'bottom-right': 'w-tw-10:h-th-10',
    center: '(w-tw)/2:(h-th)/2',
  };
  const pos = posMap[position] || posMap.bottom;
  const escapedText = text.replace(/['"]/g, '\\$&').replace(/:/g, '\\:');
  const drawText = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${color}:x=${pos}:y=${pos}:shadowcolor=black:shadowx=2:shadowy=2`;
  await execShell(`ffmpeg -y -i "${path}" -vf "${drawText}" "${out}"`, { timeoutMs: 300000 });
  return { ok: true, data: { input: path, output: out, text, position } };
}

/**
 * Create video from images (slideshow).
 */
export async function videoFromImages({ images, fps = 1, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  // Create temp concat file
  const lines = images.map(img => `file '${img.replace(/'/g, "'\\''")}'\nduration ${1 / fps}`).join('\n');
  await execShell(`echo "${lines}" > /tmp/_imglist.txt`, { timeoutMs: 2000 });
  await execShell(`ffmpeg -y -f concat -safe 0 -i /tmp/_imglist.txt -vsync vfr -pix_fmt yuv420p "${output}"`, { timeoutMs: 120000 });
  return { ok: true, data: { images, fps, output } };
}

/**
 * Green screen / chroma key.
 */
export async function videoChromaKey({ path, color = '0x00FF00', similarity = 0.3, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, '-keyed$1');
  await execShell(`ffmpeg -y -i "${path}" -vf "colorkey=${color}:${similarity}:0.1" "${out}"`, { timeoutMs: 300000 });
  return { ok: true, data: { input: path, output: out, color, similarity } };
}

// ── Audio Processing ──

/**
 * Get audio metadata.
 */
export async function audioInfo({ path }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const r = await execShell(`ffprobe -v quiet -print_format json -show_format -show_streams "${path}"`, { timeoutMs: 10000 });
  const data = JSON.parse(r.stdout);
  const stream = (data.streams || []).find(s => s.codec_type === 'audio') || {};
  return {
    ok: true,
    data: {
      path,
      format: data.format?.format_name || '',
      size: parseInt(data.format?.size || '0'),
      duration: parseFloat(data.format?.duration || '0'),
      codec: stream.codec_name || '',
      sampleRate: parseInt(stream.sample_rate || '0'),
      channels: stream.channels || 0,
      bitrate: parseInt(stream.bit_rate || data.format?.bit_rate || '0'),
    },
  };
}

/**
 * Convert audio format.
 */
export async function audioConvert({ input, output, sampleRate, channels }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const args = ['-y', '-i', `"${input}"`];
  if (sampleRate) args.push('-ar', String(sampleRate));
  if (channels) args.push('-ac', String(channels));
  args.push(`"${output}"`);
  await execShell(`ffmpeg ${args.join(' ')}`, { timeoutMs: 120000 });
  return { ok: true, data: { input, output, sampleRate, channels } };
}

/**
 * Trim audio segment.
 */
export async function audioTrim({ path, start = 0, duration, end, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, '-trim$1');
  const fmtTime = (t) => typeof t === 'number' ? new Date(t * 1000).toISOString().substr(11, 8) : t;
  const args = ['-y', '-i', `"${path}"`, '-ss', fmtTime(start)];
  if (duration) args.push('-t', fmtTime(duration));
  else if (end) args.push('-to', fmtTime(end));
  args.push('-c', 'copy', `"${out}"`);
  await execShell(`ffmpeg ${args.join(' ')}`, { timeoutMs: 120000 });
  return { ok: true, data: { input: path, output: out, start, duration, end } };
}

/**
 * Merge/concatenate audio files.
 */
export async function audioConcat({ files, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  // Use concat demuxer
  const list = files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
  await execShell(`echo "${list}" > /tmp/_aconcat.txt`, { timeoutMs: 2000 });
  await execShell(`ffmpeg -y -f concat -safe 0 -i /tmp/_aconcat.txt -c copy "${output}"`, { timeoutMs: 300000 });
  return { ok: true, data: { files, output } };
}

/**
 * Mix audio tracks (overlay).
 */
export async function audioMix({ tracks, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const inputs = tracks.map(() => '-i').flat();
  // Build amix filter
  const count = tracks.length;
  await execShell(`ffmpeg -y ${tracks.map(t => `-i "${t}"`).join(' ')} -filter_complex "amix=inputs=${count}:duration=first:dropout_transition=2" "${output}"`, { timeoutMs: 300000 });
  return { ok: true, data: { tracks, output } };
}

/**
 * Adjust audio volume.
 */
export async function audioVolume({ path, volume = 1.0, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, `-vol$1`);
  await execShell(`ffmpeg -y -i "${path}" -af "volume=${volume}" "${out}"`, { timeoutMs: 120000 });
  return { ok: true, data: { input: path, output: out, volume } };
}

/**
 * Noise reduction for audio.
 */
export async function audioNoiseReduce({ path, strength = 0.2, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, '-denoised$1');
  await execShell(`ffmpeg -y -i "${path}" -af "afftdn=nr=${Math.round(strength * 100)}" "${out}"`, { timeoutMs: 120000 });
  return { ok: true, data: { input: path, output: out, strength } };
}

/**
 * Change audio speed/pitch.
 */
export async function audioSpeed({ path, speed = 1.0, output }) {
  await findTool('ffmpeg');
  requireTool('ffmpeg', INSTALL_HINTS.ffmpeg);
  const out = output || path.replace(/(\.\w+)$/, `-x${speed}$1`);
  await execShell(`ffmpeg -y -i "${path}" -af "atempo=${Math.min(100, Math.max(0.5, speed))}" "${out}"`, { timeoutMs: 120000 });
  return { ok: true, data: { input: path, output: out, speed } };
}

/**
 * Extract audio segment / sample.
 */
export async function audioExtractSegment({ path, start, duration, output }) {
  return audioTrim({ path, start, duration, output });
}

// ── Tool List Registration ──

export function getMediaToolList() {
  return [
    // Image tools
    { name: 'image_info', description: '获取图片信息（尺寸、格式、编码、大小）' },
    { name: 'image_convert', description: '转换图片格式（png/jpg/webp/gif/bmp/tiff），可指定质量' },
    { name: 'image_resize', description: '调整图片尺寸（resize/crop/fit/pad），指定宽高和模式' },
    { name: 'image_filter', description: '应用图片滤镜（grayscale/sepia/negate/blur/sharpen/edge/emboss）' },
    { name: 'image_compress', description: '压缩图片文件大小，可指定质量和最大宽度' },
    { name: 'image_watermark', description: '给图片添加水印（图片叠加，支持位置和透明度）' },
    // Video tools
    { name: 'video_info', description: '获取视频信息（编码、分辨率、时长、帧率、码率）' },
    { name: 'video_trim', description: '裁剪视频片段，指定开始时间和持续时长' },
    { name: 'video_concat', description: '拼接多个视频文件为一个' },
    { name: 'video_convert', description: '转换视频格式和编码（mp4/mov/avi/mkv/webm/gif）' },
    { name: 'video_extract_audio', description: '从视频中提取音频（mp3格式）' },
    { name: 'video_compress', description: '压缩视频文件大小（CRF控制质量）' },
    { name: 'video_add_subtitles', description: '为视频添加字幕文件' },
    { name: 'video_speed', description: '调整视频播放速度' },
    // Advanced video editing
    { name: 'video_transition', description: '添加视频过渡效果（fade/crossfade/dissolve/wipe）' },
    { name: 'video_text_overlay', description: '在视频上叠加文字，支持位置和样式' },
    { name: 'video_from_images', description: '将图片序列合成为视频（幻灯片效果）' },
    { name: 'video_chroma_key', description: '绿幕抠像/色度键，支持自定义颜色' },
    // Audio tools
    { name: 'audio_info', description: '获取音频信息（编码、采样率、声道、时长）' },
    { name: 'audio_convert', description: '转换音频格式，支持采样率和声道调整' },
    { name: 'audio_trim', description: '裁剪音频片段' },
    { name: 'audio_concat', description: '拼接多个音频文件' },
    { name: 'audio_mix', description: '混音：将多个音频轨道叠加混合' },
    { name: 'audio_volume', description: '调整音频音量' },
    { name: 'audio_noise_reduce', description: '音频降噪处理' },
    { name: 'audio_speed', description: '调整音频播放速度/音调' },
    { name: 'audio_extract_segment', description: '提取音频片段/采样' },
  ];
}
