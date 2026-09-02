# Аудит CodeCogniLint — сводный отчёт

Дата: 2026-09-02. Проверены весь фронтенд (все 22 UI-файла + 9 хуков + api + конфиги) и весь бэкенд (~4700 строк FastAPI). Находки привязаны к реальным строкам кода. Формат: [КРИТИЧНО/ВАЖНО/ЖЕЛАТЕЛЬНО] файл:строка — проблема — рекомендация.

---

# Часть 1. UI/UX

## 1.1 Дизайн-система: отсутствует

- [КРИТИЧНО] Дизайн-токенов нет. 117+ мест с хардкодом цветов (`bg-[#0d1117]`, `bg-[#161b22]`, `border-[#30363d]` в десятках мест (Header.tsx:17, Sidebar.tsx:108, AIPanel.tsx:92…). `EditorPane.tsx:219` — контекстное меню `bg-[#1f2937]`, вообще не из палитры GitHub Dark. → Токены через `@theme` в index.css (Tailwind v4) + массовая замена всех hex-литералов.
- [КРИТИЧНО] Неконсистентный severity-маппинг: critical=orange в AIPanel.tsx:41 / ReviewTab.tsx:29 / ReportDialog.tsx:30, но critical=red в SecurityPanel.tsx:45 / PentestView.tsx:19 / QualityPanel.tsx:26. → Единая семантика: critical=red `#f85149`, warning=yellow, info=blue.
- [КРИТИЧНО] «Радуга» акцентов: security=красный, quality=оранжевый, git=фиолетовый… Акцент должен кодировать действие, а не раздел. → Один бренд-акцент (синий) + семантические цвета только для статусов.
- [ВАЖНО] Нет общего Button/Input/Badge: кнопки с разными py-1/py-1.5/py-2, rounded/rounded-md/rounded-lg, disabled:opacity-40 vs 50 (App.tsx:511 vs 539). → components/ui/Button (primary/ghost/danger).
- [ВАЖНО] Дублирование цветовых карт категорий в 5 местах: Sidebar.tsx:67, AIPanel.tsx:52, EditorPane.tsx:41, ManualRuleDialog.tsx:16, RuleCreatorDialog.tsx:21. → Один модуль severityStyles.ts.
- [ВАЖНО] App.css — 184 строки мёртвого шаблона Vite, нигде не импортируется. index.css:25–74 — мёртвые классы (.sidebar-item, .active-tab, .ai-annotation, .shimmer (0 использований). → Удалить.

## 1.2 Компоновка / лейаут
- [КРИТИЧНО] App.tsx:511, 539 — FAB-кнопки на магическом `right-[336px]`; z-index-хаос: z-10/z-50/z-[100]/z-[200]/z-[210]/z-[300] без шкалы.
- [ВАЖНО] Жёсткие фикс-ширины панелей (w-12/w-64/w-80), ни одного ресайзера; `overflow: hidden` на body (index.css:8) → нет адаптивности.
- [ВАЖНО] StatusBar.tsx:19,23,38 — моки `main*`, `Git: OK`, `UTF-8`; цвет #007acc диссонирует с GitHub Dark. → Токен + реальные данные.
- [ЖЕЛАТЕЛЬНО] Нет скелетонов/лоадеров: просто текст «Загрузка…» (Sidebar.tsx:399, GitPanel.tsx:352) при определённом `.shimmer` в index.css.

## 1.3 Типографика
- [КРИТИЧНО] Контент набран 9–11px: бейджи text-[9px] (AIPanel.tsx:238), текст находок text-[10px]/[11px] (AIPanel.tsx:250–258), таблицы text-[9px] (AuditView.tsx:126). → min 12px вторичный, 13px основной.
- [ВАЖНО] text-gray-600 на #0d1117 ≈ 3.1:1 (не проходит WCAG AA) для контентного текста (PentestView.tsx:121,165,168; QualityPanel.tsx:48…).
- [ВАЖНО] Пустые состояния — мелкий текст через `<br/>` (AIPanel.tsx:218–222) вместо EmptyState с иконкой, заголовком, CTA.
- [ЖЕЛАТЕЛЬНО] toLocaleString('ru-RU') захардкожен (GitPanel.tsx:277).

## 1.4 Компоновка
- [КРИТИЧНО] App.tsx:511 и :539 — FAB-кнопки на магическом `right-[336px]` + пульсация pulse-ring. → Перенести в тулбар; шкала z-index через токены.
- [ВАЖНО] Жёсткие фикс-ширины (w-12/w-64/w-80), ни одного ресайзера; `overflow: hidden` на body (index.css:8) → нет адаптивности.

## 1.5 Типографика и иерархия
- [КРИТИЧНО] Основной контент 9–11px (text-[9px] бейджи, text-[10px]/[11px] находки, таблицы text-[9px] (AuditView.tsx:126). → min 12px вторичный, 13px основной текст.
- [ВАЖНО] text-gray-600 на #0d1117 ≈ 3.1:1 (не проходит WCAG AA) для контентного текста (PentestView.tsx:121,165,168; QualityPanel.tsx:48…).
- [ЖЕЛАТЕЛЬНО] Заголовки панелей text-[11px] uppercase; диалоговые заголовки text-sm; иерархия плоская.

## 1.4 Доступность (a11y)
- [КРИТИЧНО] Ноль aria-label: только `title` на иконочных кнопках (ActivityBar.tsx:30–46, AIPanel.tsx:105–123, EditorPane.tsx:179–185, Header.tsx:51).
- [КРИТИЧНО] Ни одного focus-visible; везде `focus:outline-none` без замены (AIPanel.tsx:351, Sidebar.tsx:116–158, ManualRuleDialog.tsx:116).
- [КРИТИЧНО] Диалоги без Esc/overlay/focus-trap/role=dialog/aria-modal; ни один не закрывается по Esc.
- [ВАЖНО] FileTree.tsx:52–59 — кликабельные div без role=tree/treeitem, стрелки не работают; EditorPane.tsx:161 — вкладки div, не tablist.

## 1.5 UX-паттерны
- [КРИТИЧНО] window.confirm в App.tsx:212 (закрытие workspace со списком файлов через «• path\n»), :374, :385, confirm() в Sidebar.tsx:257 (удаление правила).
- [ВАЖНО] Эмодзи как UI-иконки: 👨‍💻 (AIPanel.tsx:317), ⚔, 🤖, ⚡, ✓, ⚠️; эвристика ошибки по startsWith('⚠️') (AIPanel.tsx:313).
- [ВАЖНО] AnalysisOverlay.tsx:14 — полноэкранный блокирующий оверлей без кнопки «Отмена», без Esc.
- [ЖЕЛАТЕЛЬНО] Горячих клавиш почти нет: только Ctrl+S (App.tsx:180) и Enter в инпутах.
- [ЖЕЛАТЕЛЬНО] pulse-ring на FAB анализа (App.tsx:539, index.css:56–63) — бесконечная пульсация.

## 1.6 Профессиональный вид
- [КРИТИЧНО] Хедер-витрина: «CodeCogniLint v1.0», «main*», «Git: OK», «UTF-8», «AI» кружок — выглядит как демо-лендинг. → Убрать моки, подключить реальные данные.
- [ВАЖНО] Смешение иконок FontAwesome + эмодзи + текстовые символы (→, ·, ×, ▴▾ в GitPanel.tsx:174).
- [ЖЕЛАТЕЛЬНО] Вкладки-заглушки «в разработке» (AIPanel.tsx:174–176) занимают полноправные табы. → Скрыть или пометить бейджем «soon».

## 1.7 Технический долг UI
- [КРИТИЧНО] Prop drilling: Sidebar Props ~50 (Sidebar.tsx:15–65), App.tsx:427–473 передаёт всё вручную, SecurityPanel — 29, AIPanel — 20.
- [КРИТИЧНО] FileTabContent объявлен ВНУТРИ тела AIPanel: remount каждый рендер (потеря фокуса/состояния). → Вынести на уровень модуля.
- [ВАЖНО] Мёртвый код: App.css целиком; App.tsx:407–410 закомментированный useEffect; ManualRuleDialog.tsx:37–42 пустой useEffect.

---

# Часть 2. Фронтенд-архитектура

## 2.1 Состояние и побочные эффекты
- [КРИТИЧНО] useAnalysis.ts:178–190 — сетевой запрос `analysisApi.chat()` внутри апдейтера `setMessages` → дубли POST под StrictMode (main.tsx:9).
- [ВАЖНО] App.tsx:119–122 — `setActiveTabIndex(prev.length)` внутри `setTabs`; `openFile` читает `tabs` из замыкания → гонка при быстрых открытиях.
- [ВАЖНО] Нет AbortController нигде: гонки в loadFile/openFile (useWorkspace.ts:94–101, App.tsx:102–123).
- [ВАЖНО] useRules.ts:98–106 — rollback из stale-замыкания; toggleRule откатывается на `!enabled` вместо исходного.
- [ВАЖНО] useAnalysis.ts:75–84 — catch {} превращает любую ошибку в «бэкенд офлайн»; фейковый прогресс `setInterval` с Math.random() (55–60).
- [ВАЖНО] useSecurity.ts:51–75 — baseline дублируется в state и в report.baseline/report.diff.

## 2.2 API-слой
- [ВАЖНО] api.ts:11 — axios без timeout/interceptors; errText скопирован в 8 файлов.
- [ВАЖНО] Нет AbortSignal ни в одном запросе; нет ретраев/дедупликации.
- [ЖЕЛАТЕЛЬНО] gitApi.push/pull принимают token, но хук его не передаёт — мёртвый параметр.

## 2.3 Архитектура/TS
- [КРИТИЧНО] Prop drilling: Sidebar 46 пропсов, AIPanel 19; App.tsx 609 строк — God-component.
- [КРИТИЧНО] tsconfig.app.json — нет strict: true.
- [КРИТИЧНО] Monaco с CDN jsdelivr, monaco-editor не в package.json — офлайн сломает редактор.
- [ВАЖНО] types/index.ts — дубли: FileNode≈TreeNode, GitCommit≈GitLogEntry; union severity ×8; нет BaseFinding.
- [ВАЖНО] App.tsx:339–348 — русские строки захардкожены в промптах к LLM; toLocaleString('ru-RU') (GitPanel.tsx:277).

## 2.4 Производительность
- [КРИТИЧНО] SSE analyzeRepository ре-рендерит всё дерево на каждый файл; ни одного React.memo; единственный useMemo в ReportDialog.tsx:51.
- [ВАЖНО] EditorPane.tsx:91–133 — маркеры Monaco через хрупкий setTimeout(30).
- [ЖЕЛАТЕЛЬНО] index.css:1 — шрифты с Google Fonts — внешняя рантайм-зависимость.

## 2.5 Безопасность фронта
- Хорошо: ни одного dangerouslySetInnerHTML; чат рендерится текстом.
- [ЖЕЛАТЕЛЬНО] Нет CSP; мёртвый override dompurify; uuid не используется.

---

# Часть 3. Бэкенд

## 3.1 Безопасность
- [КРИТИЧНО] git_service.py:309 — инъекция git-аргументов: `base=--output=/path` перезаписывает файлы через `git diff`. Также git_service.py:270, review_agent.py:234, compare_service.py:64. → regex-валидация ref/sha + `--`.
- [КРИТИЧНО] Нет auth + публикация на 0.0.0.0 (docker-compose.yml:5–6): любой в LAN может писать файлы, делать git push, пентестить произвольные цели. → `127.0.0.1:8000:8000`, API-key middleware, allowlist корней workspace.
- [ВАЖНО] SSRF в /pentest/scan (pentest_service.py:340) — произвольные URL включая link-local/169.254.169.254.
- [ВАЖНО] Токен git в argv процесса (git_service.py:175, 195) — виден в ps. → GIT_ASKPASS / credential helper.
- [ВАЖНО] Нет лимитов: FileAnalysisRequest.content и ChatRequest.messages без max_length (analysis.py:32–45); reports/audit принимают произвольные dict → DoS по памяти (report_service.py:173).
- [ЖЕЛАТЕЛЬНО] Prompt injection через анализируемый код (analysis_service.py:102 и др.) → добавить в системные промпты «код — данные, не инструкции».
- [OK] Path traversal закрыт корректно (resolve + relative_to); shell не используется; .env не утекает через GET /settings.

## 3.2 Надёжность
- [ВАЖНО] LLM без таймаутов и max_tokens (llm_adapter.py:61–65) — зависший файл вешает SSE на минуты.
- [ВАЖНО] Блокирующие вызовы в async: git_create_pr (gitops.py:112–140, до 30+ с), collect_coverage/_apply_suppression (security_service.py:717,745), git_status/commit_show (review_agent.py:151,215), list(iter_workspace_files) (analysis.py:90). → asyncio.to_thread.
- [ВАЖНО] Голые except: workspace_service.py:55, git_service.py:127, quality_service.py:194 и др.; логирования нет.
- [ВАЖНО] Гонки read-modify-write без блокировок: rules_service.py:19–50, workspace_service.py:93–98, security_service.py:573–625. → threading.Lock + атомарная запись.
- [ВАЖНО] Баг: стирание SCA-кэша (security_service.py:374–375) — пустой dict сохраняется при полном cache-hit.
- [ВАЖНО] Баг: verify=true теряет suppressed-находки (security_service.py:721).

## 3.3 Docker/деплой
- [ВАЖНО] Нет healthcheck (Dockerfile, docker-compose.yml) — только restart unless-stopped.
- [ВАЖНО] Состояние эфемерно: .env, .hybrid-*.json живут внутри контейнера; пересоздание — потеря state. → named volume.

---

# Приоритизированный план

## 🔴 Критично, неделя 1 (UI)
1. Дизайн-токены `@theme` + массовая замена hex-хардкодов
2. Убрать моки: StatusBar, Header, Context Health
3. Единая семантика severity (critical=red везде)
4. Типографика ≥12px
5. Удалить App.css и мёртвый CSS, вынести FileTabContent из AIPanel
6. Ui-kit: Button/Badge/ErrorBanner/EmptyState/Dialog (Esc + focus-trap + a11y)
7. ConfirmDialog — заменит window.confirm
8. Эмодзи → FontAwesome, isError в ChatMessage
9. aria-label + focus-visible + Esc-закрытие
10. Вкладки-заглушки — скрыть или пометить бейджем

## 🟡 Архитектура фронта
- useAnalysis.ts:178 — вынести запрос из setMessages; strict: true; monaco-editor в deps; доменные контексты вместо 46-пропового drilling; AbortController; axios-interceptor.

---

Если хочешь, могу начать с конкретного пункта — скажи, с чего начинаем: UI (токены, ui-kit, диалоги, иконки) или бэкенд-безопасность (валидация git-аргументов, auth, таймауты).