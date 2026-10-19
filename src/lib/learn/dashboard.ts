import type { Lesson } from './lessons';
export type EnrollmentProgress = { path?: 'foundations' | 'practice' | null; page?: string; answers?: Record<string, number>; checked?: Record<string, boolean> };
export function passedLesson(lesson: Lesson, enrollment: EnrollmentProgress, completed: Record<string, boolean>): boolean {
  return lesson.unit?.assessment ? completed[`assessment:${lesson.id}`] === true : completed[lesson.id] === true;
}
export function learningDashboard(lessons: Lesson[], enrollment: EnrollmentProgress, completed: Record<string, boolean>) {
  const passed = lessons.filter((lesson) => passedLesson(lesson, enrollment, completed));
  const next = lessons.find((lesson) => !passedLesson(lesson, enrollment, completed)) ?? null;
  const currentId = enrollment.page?.replace(/^exercise:/, '');
  const current = lessons.find((lesson) => lesson.id === currentId && !passedLesson(lesson, enrollment, completed)) ?? null;
  return { total: lessons.length, completed: passed.length, percent: lessons.length ? Math.round(passed.length / lessons.length * 100) : 0, next, current, needsPlacement: !enrollment.path };
}
