// @ts-check
const { sm, smPrefix } = require('../utils/selectors');

/**
 * Page Object del detalle/edición de un Live Stream (vista `live_stream.coffee`,
 * ruta `/live-stream/:id` y `/live-stream/new[?type=audio]`).
 *
 * REGLA: selectores solo con sm()/smPrefix() sobre marcas `[sm="..."]`. Marcas
 * cosechadas en vivo contra `dev.platform.mediastre.am` (v7.0.75).
 *
 * Las secciones AI Live Transcription, Playout y Next Settings **no** exponen
 * marcas `sm:` (issues Jurrego1771/AQ2#52/#53/#54); por eso no aparecen como
 * selectores automatizables. La cobertura de esas secciones queda solo por API.
 */
class LiveStreamDetailPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // ---- Basic Information / estado del evento ----
    this.eventName = page.locator(sm('event-name'));
    this.eventSlug = page.locator(sm('event-slug'));
    this.statusToggle = page.locator(sm('status'));
    this.saveButton = page.locator(sm('save')).first();
    this.basicInformation = page.locator(sm('basic-information')).first();

    // ---- Wizard ----
    this.nextStep = page.locator(sm('next-step'));
    this.previousStep = page.locator(sm('previous-step'));

    // ---- Recording ----
    this.recordingButton = page.locator(sm('recording'));
    this.timeRecording = page.locator(sm('time-recording'));
    this.recordingErrors = page.locator(sm('recording-errors'));

    // ---- Schedules (toolbar del detalle; el form de schedule tiene su propio POM) ----
    this.addSchedule = page.locator(sm('add-schedule')).first();
    this.addScheduleNotAllowed = page.locator(sm('add-schedule-not-allowed')).first();
    this.schedulesContainer = page.locator(sm('schedules-container')).first();
    this.schedulesNoData = page.locator(sm('schedules-no-data')).first();
    this.lastSchedulesContainer = page.locator(sm('last-schedules-container')).first();
    this.lastSchedulesNoData = page.locator(sm('last-schedules-no-data')).first();
    this.fixTzOffsetSchedule = page.locator(sm('fix-tz-offset-schedule')).first();
    this.saveSchedule = page.locator(sm('save-schedule')).first();
    this.cancelSchedule = page.locator(sm('cancel-schedule')).first();
    this.deleteSchedule = page.locator(sm('delete-schedule')).first();

    // ---- EPG ----
    this.epgSelect = page.locator(sm('epg'));
    this.syncEpg = page.locator(sm('sync-epg'));

    // ---- Advertising ----
    this.adsSelect = page.locator(sm('ads'));
    this.adInsertionSelect = page.locator(sm('ad-insertion'));
    this.googleDaiAssetKey = page.locator(sm('google-dai-asset-key'));
    this.addAdsReferer = page.locator(sm('add-ads-referer'));
    this.refererAdsList = page.locator(sm('referer-ads-list'));

    // ---- Logo ----
    this.logoImage = page.locator(sm('logo-image'));
    this.logoUpload = page.locator(sm('logo-upload'));
    this.logoLivePosition = page.locator(sm('logo-live-position'));
    this.logoDelete = page.locator(sm('logo-delete'));
    this.logoUrlLink = page.locator(sm('logo-url-link'));

    // ---- Background image (custom para error messages) ----
    this.backgroundImage = page.locator(sm('background-image'));
    this.backgroundUpload = page.locator(sm('background-upload'));
    this.backgroundDelete = page.locator(sm('background-delete'));

    // ---- Thumbnails ----
    this.thumbs = page.locator(sm('thumbs'));
    this.thumbList = page.locator(sm('thumb-list'));

    // ---- Access Restrictions (no expone `sm` en el contenido; el wrapper sí) ----
    this.customerAccessList = page.locator(sm('customer-access-list'));

    // ---- Distribution Policy ----
    this.distributionPolicy = page.locator(sm('distribution-policy'));

    // ---- PlayAnywhere (los 4 controles SÍ exponen `sm:`) ----
    this.switchPlayanywhere = page.locator(sm('switch-playanywhere'));
    this.playanywhereProjectId = page.locator(sm('playanywhere-project-id'));
    this.playanywhereProgramId = page.locator(sm('playanywhere-program-id'));
    this.switchPlayanywhereAlwaysVisible = page.locator(sm('switch-playanywhere-always-visible'));

    // ---- Encoder ----
    this.selectEncoder = page.locator(sm('select-encoder'));
    this.noEncoders = page.locator(sm('no-encoders'));
    this.withEncoders = page.locator(sm('with-encoders'));
    this.encoderDetails = page.locator(sm('encoder-details'));
    this.encoderJobDetails = page.locator(sm('encoder-job-details'));
    this.encoderStreamDetails = page.locator(sm('encoder-stream-details'));
    this.encoderPlayStop = page.locator(sm('encoder-play-stop'));
    this.createEncoderJob = page.locator(sm('create-encoder-job'));
    this.formEncoderElementalOptions = page.locator(sm('form-encoder-elemental-options'));
    this.formEncoderElementalSelected = page.locator(sm('form-encoder-elemental-selected'));
    this.newEncoderJob = page.locator(sm('new-encoder-job'));

    // ---- Metadata Icecast (visible en audio; `sm` propio) ----
    this.metadataIcecastMask = page.locator(sm('metadata-icecast-mask'));

    // ---- ITG channel ----
    this.itgChannel = page.locator(sm('itg-channel'));

    // ---- Stream URLs / Publishing ----
    this.streamName = page.locator(sm('stream-name'));
    this.originUrl = page.locator(sm('origin-url'));
    this.publishingToken = page.locator(sm('publishing-token'));
    this.refreshPublishingToken = page.locator(sm('refresh-publishing-token'));
    this.confirmTokenRefresh = page.locator(sm('confirm-token-refresh'));
    this.copyPublishingToken = page.locator(sm('copy-publishing-token'));
    this.copyOriginUrl = page.locator(sm('copy-origin-url'));
    this.copyServer = page.locator(sm('copy-server'));
    this.copyStreamName = page.locator(sm('copy-stream-name'));
    this.copyMetadata = page.locator(sm('copy-metadata'));

    // ---- RTMP / WebDAV / MediaPackage / Cloud Transcoding origins ----
    this.originServers = page.locator(sm('origin-servers'));
    this.originServersWebdav = page.locator(sm('origin-servers-webdav'));

    // ---- Monitor ----
    this.monitorErrors = page.locator(sm('monitor-errors'));
    this.monitorGlobalStatus = page.locator(sm('monitor-global-status'));
    this.monitorLeftIcon = page.locator(sm('monitor-left-icon'));
    this.monitorStatusText = page.locator(sm('monitor-status-text'));
    this.monitorZoneStatus = page.locator(sm('monitor-zone-status'));

    // ---- Embed ----
    this.embed = page.locator(sm('embed'));
    this.embedOptionAutoplay = page.locator(sm('embed-option-autoplay'));
    this.embedOptionSharing = page.locator(sm('embed-option-sharing'));
    this.embedOptionDvr = page.locator(sm('embed-option-dvr'));
    this.embedCustomWidth = page.locator(sm('embed-custom-width'));
    this.embedCustomHeight = page.locator(sm('embed-custom-height'));
    this.embedImageLarge = page.locator(sm('embed-image-large'));
    this.embedImageMedium = page.locator(sm('embed-image-medium'));
    this.embedImageSmall = page.locator(sm('embed-image-small'));

    // ---- Encoding Profile modal ----
    this.addNewProfile = page.locator(sm('add-new-profile'));
    this.openNewEncodingModal = page.locator(sm('openNewEncodingModal'));
    this.profileResolution = page.locator(sm('profileResolution'));
    this.profileVideoBitrate = page.locator(sm('profileVideoBitrate'));
    this.profileVideoCodec = page.locator(sm('profileVideoCodec'));
    this.profileAudioBitrate = page.locator(sm('profileAudioBitrate'));
    this.profileAudioCodec = page.locator(sm('profileAudioCodec'));
    this.profileFormAlert = page.locator(sm('profileFormAlert'));
    this.encodingProfiles = page.locator(sm('encoding-profiles')).first();

    // ---- Captions ----
    this.addNewCaption = page.locator(sm('add-new-caption'));
    this.subtitleLanguage = page.locator(sm('subtitle-language'));
    this.subtitleName = page.locator(sm('subtitle-name'));
    this.closeCaptionFormAlert = page.locator(sm('closeCaptionFormAlert'));

    // ---- Audio selector (solo en lives de audio) ----
    this.addNewAudioSelector = page.locator(sm('add-new-audio-selector'));
    this.audioSelectorLanguage = page.locator(sm('audio-selector-language'));

    // ---- Quiz Manager (módulo aparte, expuesto en el detalle) ----
    this.addQuiz = page.locator(sm('add-quiz'));
    this.addQuestion = page.locator(sm('add-question'));
    this.quizContent = page.locator(sm('quiz-content'));
    this.quizEditor = page.locator(sm('quiz-editor'));
    this.quizList = page.locator(sm('quiz-list'));
    this.quizListEmpty = page.locator(sm('quiz-list-empty'));
    this.quizLoader = page.locator(sm('quiz-loader'));
    this.quizTotal = page.locator(sm('quiz-total'));
    this.quizCurrentSkip = page.locator(sm('quiz-current-skip'));
    this.quizPageSize = page.locator(sm('quiz-page-size'));
    this.quizPagination = page.locator(sm('quiz-pagination'));
    this.quizQuestions = page.locator(sm('quiz-questions'));
    this.quizTitle = page.locator(sm('quiz-title'));
    this.saveQuiz = page.locator(sm('save-quiz'));

    // ---- Live Restreaming ----
    this.addLiveRestreamAlert = page.locator(sm('add-live-restream-alert'));
    this.liveRestreaming = page.locator(sm('live-restreaming'));

    // ---- sgai rotation (Ad Insertion S/GAI) ----
    this.sgaiRotationEnabled = page.locator(sm('sgai-rotation-enabled'));
    this.sgaiRotationAddRow = page.locator(sm('sgai-rotation-add-row'));
    this.sgaiRotationRows = page.locator(sm('sgai-rotation-rows'));
    this.sgaiRotationSave = page.locator(sm('sgai-rotation-save'));

    // ---- social streaming (otro consumidor del detalle) ----
    this.socialStreamingMain = page.locator(sm('social-streaming-main'));

    // ---- Player / preview del iframe ----
    this.player = page.locator(sm('player'));
    this.playerToolbar = page.locator(sm('player-toolbar'));

    // ---- Navigation / chrome ----
    this.backToList = page.locator(sm('back-to-list'));
    this.editorTitle = page.locator(sm('editor-title'));
    this.locationBar = page.locator(sm('location-bar'));
    this.nowTabList = page.locator(sm('now-tab-list'));
    this.editTab = page.locator(sm('edit-tab'));
    this.editThumbnail = page.locator(sm('edit-thumbnail'));
    this.saveEditedThumbnail = page.locator(sm('save-edited-thumbnail'));
    this.thumbUrlContainer = page.locator(sm('thumb-url-container'));
    this.pageActions = page.locator(sm('page-actions'));
    this.removeTableRow = page.locator(sm('remove-table-row'));
    this.copy = page.locator(sm('copy'));
    this.b64 = page.locator(sm('browser-incompatibility-alert')).first();
    this.globalAlert = page.locator(sm('global-alert')).first();
  }

  /** Navega al detalle de un live. @param {string} id */
  async gotoDetail(id) {
    await this.page.goto(`/live-stream/${id}`);
    await this.basicInformation.waitFor({ state: 'visible', timeout: 10_000 });
  }

  /** Toggle del Published/Not Published (`sm="status"`). */
  async setPublished(published) {
    await this.statusToggle.click();
    // el status cambia inmediatamente; con expect.poll se valida en el test.
  }
}

module.exports = { LiveStreamDetailPage };
