export const LEGACY_LESSON_COUNT = 15;
export const LESSON_COUNT = 45;
export const isLessonId = id => /^[1-9]\d*$/.test(String(id)) && Number(id)<=LESSON_COUNT;
