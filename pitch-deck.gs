function buildJobTrackerDeck() {
  var pres = SlidesApp.getActivePresentation();

  // Clear existing slides except the first
  var slides = pres.getSlides();
  for (var i = slides.length - 1; i > 0; i--) slides[i].remove();

  // ── Color palette ──
  var BG_DARK   = '#0F1117';
  var BG_CARD   = '#1A1D2E';
  var ACCENT    = '#6366F1'; // indigo
  var ACCENT2   = '#10B981'; // green
  var WHITE     = '#FFFFFF';
  var GRAY      = '#94A3B8';
  var LIGHT_BG  = '#F8FAFC';
  var DARK_TEXT = '#1E293B';

  pres.setName('Job Tracker — Product Pitch');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SLIDE 1 — Hero
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  var s1 = slides[0];
  s1.getBackground().setSolidFill(BG_DARK);
  s1.getPageElements().forEach(function(e) { e.remove(); });

  // Accent bar top
  var bar = s1.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 6);
  bar.getFill().setSolidFill(ACCENT);
  bar.getBorder().setTransparent();

  // Tag line
  var tag = s1.insertTextBox('AI-POWERED JOB SEARCH', 60, 120, 600, 40);
  tag.getText().setText('AI-POWERED JOB SEARCH');
  styleText(tag, 13, ACCENT, true, SlidesApp.ParagraphAlignment.LEFT);
  tag.getBorder().setTransparent();
  tag.getFill().setTransparent();

  // Main title
  var title = s1.insertTextBox('Job Tracker', 60, 155, 600, 100);
  title.getText().setText('Job Tracker');
  styleText(title, 64, WHITE, true, SlidesApp.ParagraphAlignment.LEFT);
  title.getBorder().setTransparent();
  title.getFill().setTransparent();

  // Subtitle
  var sub = s1.insertTextBox('From first search to signed offer —\nmanaged, scored, and guided by AI.', 60, 265, 520, 70);
  sub.getText().setText('From first search to signed offer —\nmanaged, scored, and guided by AI.');
  styleText(sub, 22, GRAY, false, SlidesApp.ParagraphAlignment.LEFT);
  sub.getBorder().setTransparent();
  sub.getFill().setTransparent();

  // URL pill
  var pill = s1.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, 60, 360, 320, 36);
  pill.getFill().setSolidFill('#1E2235');
  pill.getBorder().setTransparent();
  var pillText = s1.insertTextBox('job-tracker-omega-nine.vercel.app', 68, 366, 310, 24);
  pillText.getText().setText('job-tracker-omega-nine.vercel.app');
  styleText(pillText, 12, ACCENT2, false, SlidesApp.ParagraphAlignment.LEFT);
  pillText.getBorder().setTransparent();
  pillText.getFill().setTransparent();

  // Decorative circle
  var circle = s1.insertShape(SlidesApp.ShapeType.ELLIPSE, 540, 140, 220, 220);
  circle.getFill().setSolidFill('#1A1D2E');
  circle.getBorder().setTransparent();
  var circleInner = s1.insertShape(SlidesApp.ShapeType.ELLIPSE, 580, 180, 140, 140);
  circleInner.getFill().setSolidFill(ACCENT);
  circleInner.getBorder().setTransparent();
  circleInner.setOpacity(20);
  var circleIcon = s1.insertTextBox('🎯', 618, 218, 70, 70);
  circleIcon.getText().setText('🎯');
  styleText(circleIcon, 36, WHITE, false, SlidesApp.ParagraphAlignment.CENTER);
  circleIcon.getBorder().setTransparent();
  circleIcon.getFill().setTransparent();

  // Bottom note
  var note = s1.insertTextBox('Built for serious job seekers', 60, 460, 400, 28);
  note.getText().setText('Built for serious job seekers');
  styleText(note, 13, GRAY, false, SlidesApp.ParagraphAlignment.LEFT);
  note.getBorder().setTransparent();
  note.getFill().setTransparent();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SLIDE 2 — The Problem
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  var s2 = pres.appendSlide();
  s2.getBackground().setSolidFill(LIGHT_BG);
  s2.getPageElements().forEach(function(e) { e.remove(); });

  addSlideHeader(s2, 'The Problem', 'Job searching is broken', DARK_TEXT, ACCENT);

  var problems = [
    ['📋', 'No single place', 'Jobs are scattered across LinkedIn, Glassdoor, emails, and spreadsheets.'],
    ['❓', 'No clarity', 'You don\'t know if you\'re actually a good fit before spending hours applying.'],
    ['😓', 'Easy to drop the ball', 'Follow-ups, interviews, and deadlines fall through the cracks.'],
  ];

  var xStart = 40;
  problems.forEach(function(p, i) {
    var x = xStart + i * 220;
    var card = s2.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, x, 200, 200, 170);
    card.getFill().setSolidFill(WHITE);
    card.getBorder().setTransparent();

    var emoji = s2.insertTextBox(p[0], x + 10, 215, 50, 50);
    emoji.getText().setText(p[0]);
    styleText(emoji, 28, DARK_TEXT, false, SlidesApp.ParagraphAlignment.LEFT);
    emoji.getBorder().setTransparent();
    emoji.getFill().setTransparent();

    var cardTitle = s2.insertTextBox(p[1], x + 10, 265, 180, 28);
    cardTitle.getText().setText(p[1]);
    styleText(cardTitle, 14, DARK_TEXT, true, SlidesApp.ParagraphAlignment.LEFT);
    cardTitle.getBorder().setTransparent();
    cardTitle.getFill().setTransparent();

    var cardDesc = s2.insertTextBox(p[2], x + 10, 295, 180, 70);
    cardDesc.getText().setText(p[2]);
    styleText(cardDesc, 11, '#64748B', false, SlidesApp.ParagraphAlignment.LEFT);
    cardDesc.getBorder().setTransparent();
    cardDesc.getFill().setTransparent();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SLIDE 3 — The Solution
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  var s3 = pres.appendSlide();
  s3.getBackground().setSolidFill(BG_DARK);
  s3.getPageElements().forEach(function(e) { e.remove(); });

  // Top bar
  var bar3 = s3.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 6);
  bar3.getFill().setSolidFill(ACCENT2);
  bar3.getBorder().setTransparent();

  addSlideHeader(s3, 'The Solution', 'One platform. Full pipeline. AI at every step.', WHITE, ACCENT2);

  var features = [
    ['🗂️', 'Kanban Pipeline', 'Visual board to track every job from Backlog to Offer.'],
    ['🤖', 'AI Match Score', 'Get a 0-100 score with transparent breakdown before you apply.'],
    ['📄', 'Resume Tailoring', 'AI rewrites your resume for each specific role. Review every change.'],
    ['🔔', 'Smart Reminders', 'Never miss a follow-up. Overdue alerts surface to the top.'],
    ['🔍', 'Job Discovery', 'Search LinkedIn, Glassdoor, AllJobs and more — in one place.'],
    ['💬', 'LinkedIn Extension', 'One click to save any LinkedIn job directly to your board.'],
  ];

  var cols = 3;
  features.forEach(function(f, i) {
    var col = i % cols;
    var row = Math.floor(i / cols);
    var x = 30 + col * 225;
    var y = 190 + row * 120;

    var fcard = s3.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, x, y, 205, 100);
    fcard.getFill().setSolidFill(BG_CARD);
    fcard.getBorder().setTransparent();

    var fEmoji = s3.insertTextBox(f[0], x + 12, y + 12, 36, 36);
    fEmoji.getText().setText(f[0]);
    styleText(fEmoji, 20, WHITE, false, SlidesApp.ParagraphAlignment.LEFT);
    fEmoji.getBorder().setTransparent();
    fEmoji.getFill().setTransparent();

    var fTitle = s3.insertTextBox(f[1], x + 12, y + 48, 185, 22);
    fTitle.getText().setText(f[1]);
    styleText(fTitle, 12, WHITE, true, SlidesApp.ParagraphAlignment.LEFT);
    fTitle.getBorder().setTransparent();
    fTitle.getFill().setTransparent();

    var fDesc = s3.insertTextBox(f[2], x + 12, y + 68, 185, 28);
    fDesc.getText().setText(f[2]);
    styleText(fDesc, 9.5, GRAY, false, SlidesApp.ParagraphAlignment.LEFT);
    fDesc.getBorder().setTransparent();
    fDesc.getFill().setTransparent();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SLIDE 4 — AI Deep Dive
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  var s4 = pres.appendSlide();
  s4.getBackground().setSolidFill(LIGHT_BG);
  s4.getPageElements().forEach(function(e) { e.remove(); });

  addSlideHeader(s4, 'AI at the Core', 'Not just tracking — intelligent guidance at every stage', DARK_TEXT, ACCENT);

  var steps = [
    { emoji: '1', label: 'Add Job', desc: 'Paste a job description or save from LinkedIn with one click.' },
    { emoji: '2', label: 'AI Scores It', desc: 'Match score 0–100 with a transparent breakdown of every requirement.' },
    { emoji: '3', label: 'Tailor Resume', desc: 'AI rewrites your resume for the role. Accept or reject each change.' },
    { emoji: '4', label: 'Stay on Track', desc: 'Reminders, next-action suggestions, and overdue alerts keep you moving.' },
  ];

  // Draw arrow flow
  steps.forEach(function(step, i) {
    var x = 30 + i * 168;
    var y = 195;

    // Circle
    var circle = s4.insertShape(SlidesApp.ShapeType.ELLIPSE, x + 60, y, 50, 50);
    circle.getFill().setSolidFill(ACCENT);
    circle.getBorder().setTransparent();

    var num = s4.insertTextBox(step.emoji, x + 60, y + 10, 50, 34);
    num.getText().setText(step.emoji);
    styleText(num, 18, WHITE, true, SlidesApp.ParagraphAlignment.CENTER);
    num.getBorder().setTransparent();
    num.getFill().setTransparent();

    // Arrow between steps
    if (i < steps.length - 1) {
      var arrow = s4.insertTextBox('→', x + 118, y + 12, 30, 30);
      arrow.getText().setText('→');
      styleText(arrow, 18, ACCENT, true, SlidesApp.ParagraphAlignment.CENTER);
      arrow.getBorder().setTransparent();
      arrow.getFill().setTransparent();
    }

    var sLabel = s4.insertTextBox(step.label, x + 20, y + 60, 130, 24);
    sLabel.getText().setText(step.label);
    styleText(sLabel, 13, DARK_TEXT, true, SlidesApp.ParagraphAlignment.CENTER);
    sLabel.getBorder().setTransparent();
    sLabel.getFill().setTransparent();

    var sDesc = s4.insertTextBox(step.desc, x + 10, y + 86, 150, 60);
    sDesc.getText().setText(step.desc);
    styleText(sDesc, 10, '#64748B', false, SlidesApp.ParagraphAlignment.CENTER);
    sDesc.getBorder().setTransparent();
    sDesc.getFill().setTransparent();
  });

  // Highlight box
  var highlight = s4.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, 40, 330, 640, 60);
  highlight.getFill().setSolidFill('#EEF2FF');
  highlight.getBorder().setTransparent();
  var hlText = s4.insertTextBox('💡  The AI doesn\'t just score — it explains every deduction, suggests how to position yourself, and rewrites your resume without inventing experience.', 60, 340, 610, 40);
  hlText.getText().setText('💡  The AI doesn\'t just score — it explains every deduction, suggests how to position yourself, and rewrites your resume without inventing experience.');
  styleText(hlText, 11, ACCENT, false, SlidesApp.ParagraphAlignment.LEFT);
  hlText.getBorder().setTransparent();
  hlText.getFill().setTransparent();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SLIDE 5 — CTA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  var s5 = pres.appendSlide();
  s5.getBackground().setSolidFill(BG_DARK);
  s5.getPageElements().forEach(function(e) { e.remove(); });

  // Bottom accent bar
  var bar5 = s5.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 498, 720, 6);
  bar5.getFill().setSolidFill(ACCENT);
  bar5.getBorder().setTransparent();

  var ctaTag = s5.insertTextBox('TRY IT NOW', 60, 110, 600, 36);
  ctaTag.getText().setText('TRY IT NOW');
  styleText(ctaTag, 13, ACCENT2, true, SlidesApp.ParagraphAlignment.CENTER);
  ctaTag.getBorder().setTransparent();
  ctaTag.getFill().setTransparent();

  var ctaTitle = s5.insertTextBox('Start your smarter\njob search today.', 60, 145, 600, 130);
  ctaTitle.getText().setText('Start your smarter\njob search today.');
  styleText(ctaTitle, 48, WHITE, true, SlidesApp.ParagraphAlignment.CENTER);
  ctaTitle.getBorder().setTransparent();
  ctaTitle.getFill().setTransparent();

  var ctaSub = s5.insertTextBox('Free to use. No setup. Just sign up and start tracking.', 60, 280, 600, 36);
  ctaSub.getText().setText('Free to use. No setup. Just sign up and start tracking.');
  styleText(ctaSub, 16, GRAY, false, SlidesApp.ParagraphAlignment.CENTER);
  ctaSub.getBorder().setTransparent();
  ctaSub.getFill().setTransparent();

  // URL button
  var btnBg = s5.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, 210, 340, 300, 50);
  btnBg.getFill().setSolidFill(ACCENT);
  btnBg.getBorder().setTransparent();
  var btnText = s5.insertTextBox('job-tracker-omega-nine.vercel.app', 210, 354, 300, 28);
  btnText.getText().setText('job-tracker-omega-nine.vercel.app');
  styleText(btnText, 13, WHITE, true, SlidesApp.ParagraphAlignment.CENTER);
  btnText.getBorder().setTransparent();
  btnText.getFill().setTransparent();

  // Stats row
  var stats = [['6', 'AI Features'], ['100%', 'Match Scoring'], ['∞', 'Jobs Tracked']];
  stats.forEach(function(stat, i) {
    var sx = 100 + i * 200;
    var num = s5.insertTextBox(stat[0], sx, 420, 120, 40);
    num.getText().setText(stat[0]);
    styleText(num, 28, ACCENT2, true, SlidesApp.ParagraphAlignment.CENTER);
    num.getBorder().setTransparent();
    num.getFill().setTransparent();

    var lbl = s5.insertTextBox(stat[1], sx, 458, 120, 22);
    lbl.getText().setText(stat[1]);
    styleText(lbl, 11, GRAY, false, SlidesApp.ParagraphAlignment.CENTER);
    lbl.getBorder().setTransparent();
    lbl.getFill().setTransparent();
  });

  SlidesApp.getUi().alert('✅ Done! Your Job Tracker pitch deck has been created.');
}

// ── Helpers ──

function styleText(shape, size, color, bold, align) {
  var textRange = shape.getText();
  var style = textRange.getTextStyle();
  style.setFontSize(size);
  style.setForegroundColor(color);
  style.setBold(bold);
  textRange.getParagraphs().forEach(function(p) {
    p.getRange().getParagraphStyle().setParagraphAlignment(align);
  });
}

function addSlideHeader(slide, tag, title, titleColor, accentColor) {
  var tagBox = slide.insertTextBox(tag.toUpperCase(), 40, 40, 640, 28);
  tagBox.getText().setText(tag.toUpperCase());
  styleText(tagBox, 11, accentColor, true, SlidesApp.ParagraphAlignment.LEFT);
  tagBox.getBorder().setTransparent();
  tagBox.getFill().setTransparent();

  var line = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 40, 68, 60, 3);
  line.getFill().setSolidFill(accentColor);
  line.getBorder().setTransparent();

  var titleBox = slide.insertTextBox(title, 40, 82, 640, 80);
  titleBox.getText().setText(title);
  styleText(titleBox, 28, titleColor, true, SlidesApp.ParagraphAlignment.LEFT);
  titleBox.getBorder().setTransparent();
  titleBox.getFill().setTransparent();
}
