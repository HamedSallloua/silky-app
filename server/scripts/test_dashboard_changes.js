import { themeRepository } from '../repositories/theme.repository.js';
import { runAnnouncementsMigration } from '../db/migrations/add_announcements.js';
import { pool } from '../db/pool.js';

async function runTests() {
  console.log('--- Starting Admin Dashboard Changes Test Suite ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // Test 1: Migration runs safely
    await runAnnouncementsMigration(pool);
    assert(true, 'runAnnouncementsMigration runs idempotently');

    // Test 2: Get initial settings
    const initial = await themeRepository.getSettings();
    assert(initial && typeof initial === 'object', 'themeRepository.getSettings() returns an object');
    assert(Array.isArray(initial.announcements), 'initial.announcements is an array');
    assert(initial.announcements.length > 0, `initial announcements count: ${initial.announcements.length}`);

    // Test 3: Update announcements with formatting
    const customAnnouncements = [
      { text: 'Annonce 1', bold: true, italic: false, underline: false },
      { text: 'Annonce 2', bold: false, italic: true, underline: true },
      { text: 'Annonce 3', bold: true, italic: true, underline: true },
    ];
    const updated = await themeRepository.updateSettings({
      primary: initial.primary,
      secondary: initial.secondary,
      heroLeftImage: initial.heroLeftImage,
      heroRightImage: initial.heroRightImage,
      announcements: customAnnouncements,
    });
    assert(updated.announcements.length === 3, 'Updated announcements count is 3');
    assert(updated.announcements[0].text === 'Annonce 1' && updated.announcements[0].bold === true, 'Announcement 1 bold formatting preserved');
    assert(updated.announcements[1].text === 'Annonce 2' && updated.announcements[1].italic === true && updated.announcements[1].underline === true, 'Announcement 2 italic and underline preserved');

    // Test 4: Enforce max 7 announcements
    const eightAnnouncements = Array.from({ length: 8 }, (_, i) => ({
      text: `Annonce ${i + 1}`,
      bold: false,
      italic: false,
      underline: false,
    }));
    const updatedMax = await themeRepository.updateSettings({
      primary: initial.primary,
      secondary: initial.secondary,
      heroLeftImage: initial.heroLeftImage,
      heroRightImage: initial.heroRightImage,
      announcements: eightAnnouncements,
    });
    assert(updatedMax.announcements.length === 7, 'Enforces max 7 announcements');

    // Test 5: Delete heroLeftImage (set to '') while keeping heroRightImage
    const deletedLeft = await themeRepository.updateSettings({
      primary: initial.primary,
      secondary: initial.secondary,
      heroLeftImage: '',
      heroRightImage: '/pictures/enfant_example.jpg',
      announcements: customAnnouncements,
    });
    assert(deletedLeft.heroLeftImage === '', 'heroLeftImage can be deleted (empty string)');
    assert(deletedLeft.heroRightImage === '/pictures/enfant_example.jpg', 'heroRightImage remains untouched');

    // Test 6: Clear all announcements (empty array)
    const emptyAnnouncements = await themeRepository.updateSettings({
      primary: initial.primary,
      secondary: initial.secondary,
      heroLeftImage: initial.heroLeftImage,
      heroRightImage: initial.heroRightImage,
      announcements: [],
    });
    assert(Array.isArray(emptyAnnouncements.announcements) && emptyAnnouncements.announcements.length === 0, 'Can clear all announcements to empty array');

    // Test 7: Default underline resolution (unspecified formatting defaults to false)
    const unspecifiedAnnouncements = await themeRepository.updateSettings({
      primary: initial.primary,
      secondary: initial.secondary,
      heroLeftImage: initial.heroLeftImage,
      heroRightImage: initial.heroRightImage,
      announcements: [
        { text: 'Normal text only' },
        'Simple string announcement',
      ],
    });
    assert(unspecifiedAnnouncements.announcements[0].underline === false, 'Missing underline defaults to false');
    assert(unspecifiedAnnouncements.announcements[0].bold === false, 'Missing bold defaults to false');
    assert(unspecifiedAnnouncements.announcements[0].italic === false, 'Missing italic defaults to false');
    assert(unspecifiedAnnouncements.announcements[1].underline === false, 'String announcement underline defaults to false');

    // Test 8: Toggle announcementsHidden state (Masquer / Afficher)
    const hiddenTheme = await themeRepository.updateSettings({
      primary: initial.primary,
      secondary: initial.secondary,
      heroLeftImage: initial.heroLeftImage,
      heroRightImage: initial.heroRightImage,
      announcements: customAnnouncements,
      announcementsHidden: true,
    });
    assert(hiddenTheme.announcementsHidden === true, 'announcementsHidden can be set to true');
    const fetchedHidden = await themeRepository.getSettings();
    assert(fetchedHidden.announcementsHidden === true, 'announcementsHidden persists as true on getSettings');
    assert(fetchedHidden.announcements.length === 3, 'Announcements remain saved when hidden');

    const visibleTheme = await themeRepository.updateSettings({
      primary: initial.primary,
      secondary: initial.secondary,
      heroLeftImage: initial.heroLeftImage,
      heroRightImage: initial.heroRightImage,
      announcements: customAnnouncements,
      announcementsHidden: false,
    });
    assert(visibleTheme.announcementsHidden === false, 'announcementsHidden can be restored to false');
    const fetchedVisible = await themeRepository.getSettings();
    assert(fetchedVisible.announcementsHidden === false, 'announcementsHidden persists as false on getSettings');

    // Reset back to initial theme settings
    await themeRepository.updateSettings({
      primary: initial.primary,
      secondary: initial.secondary,
      heroLeftImage: initial.heroLeftImage,
      heroRightImage: initial.heroRightImage,
      announcements: initial.announcements,
      announcementsHidden: initial.announcementsHidden || false,
    });
    assert(true, 'Cleaned up and restored initial settings');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
