import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo
} from 'react';

import {
  Brain,
  Send,
  Loader,
  X,
  Plus,
  MessageSquare,
  Trash2,
  Menu,
  User,
  Sparkles,
  AlertCircle,
  RefreshCw,
  WifiOff,
  Activity,
  Target,
  Zap,
  ChevronRight
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../services/backendAuth';

const BACKEND_URL = 'https://api.zokascore.xyz';

const STORAGE_KEY = 'kim_chats';
const STORAGE_VERSION = 2;
const MAX_HISTORY_MESSAGES = 30;

/* ============================================================
   LOCAL ZOKASCORE KNOWLEDGE
============================================================ */

const APP_KNOWLEDGE_BASE = [
  {
    keywords: [
      'how to predict',
      'make a prediction',
      'how do i get points',
      'what are points',
      'scoring system',
      'prediction lock',
      'how to play'
    ],
    response: `# How Predictions Work

Making a prediction is easy. Go to the **Predictions** tab and enter your expected score before the match locks.

- **Exact Score:** 10 Points 🎯
- **Correct Result:** 3 Points 📈
- **Miss:** 0 Points

Matches lock before kickoff to keep predictions fair.`
  },

  {
    keywords: [
      'zokascore studio',
      'how to use the studio',
      'reactor studio',
      'face ar',
      'graphic editor',
      'reaction cam'
    ],
    response: `# ZOKASCORE Studio

The Studio is ZOKASCORE's creator toolkit.

- **Graphic Editor:** Create football graphics and scoreboards.
- **Reactor Studio:** Create short-form football content.
- **Face AR:** Football masks and camera effects.
- **Reaction Cam:** Record match reactions in vertical format.`
  },

  {
    keywords: [
      'leaderboard',
      'how do i rank',
      'goat rank',
      'weekly leaderboard',
      'daily leaderboard',
      'monthly leaderboard',
      'hall of fame'
    ],
    response: `# Leaderboards & Ranks

Compete with other football fans.

- **Daily:** Daily ranking.
- **Weekly:** Weekly competition.
- **Monthly:** Monthly competition.
- **G.O.A.T:** Long-term leaderboard.

Check the leaderboard from the ZOKASCORE navigation.`
  },

  {
    keywords: [
      'zoka picks',
      'admin picks',
      'what are zoka picks',
      'expert picks'
    ],
    response: `# Zoka Picks

Zoka Picks are curated predictions published by the ZOKASCORE team.

You can also use the community voting features to see how other users feel about a prediction.`
  },

  {
    keywords: [
      'install zokascore',
      'download the app',
      'install app',
      'pwa',
      'add to home screen',
      'offline mode'
    ],
    response: `# Install ZOKASCORE

ZOKASCORE is a Progressive Web App.

You can install it directly from a supported browser using **Add to Home Screen** or the browser's install option.

Once installed, it behaves much more like a native application.`
  },

  {
    keywords: [
      'who made zokascore',
      'who built zokascore',
      'zokascore developer',
      'zokascore creator',
      'about the creator',
      'who made this'
    ],
    response: `# About ZOKASCORE

ZOKASCORE is an independently developed football platform focused on live football data, fixtures, results, statistics, predictions and football intelligence. ⚽`
  },

  {
    keywords: [
      'contact support',
      'report a bug',
      'zokascore email',
      'help center',
      'how to contact'
    ],
    response: `# Need Help?

For support or bug reports, use the Contact section of ZOKASCORE.

You can also reach the team at **streetzoka@gmail.com**.`
  }
];

/*
 * Questions containing these subjects should go to the backend
 * rather than being answered by the small local application KB.
 */
const FOOTBALL_TRIGGERS = [
  'world cup',
  'offside',
  'foul',
  'penalty',
  'tactical',
  'formation',
  'gegenpress',
  'low block',
  'match',
  'who won',
  'who hosted',
  'champion',
  'final',
  'build-up',
  'false 9',
  'var',
  'fixture',
  'score',
  'prediction',
  'predict',
  'form',
  'h2h',
  'head to head',
  'compare',
  'standings',
  'table',
  'league',
  'team',
  'player',
  'goal',
  'goals',
  'today',
  'tomorrow',
  'yesterday',
  'live'
];

function interceptLocalQuery(query) {
  const q = String(query || '').toLowerCase();

  /*
   * Football questions must reach KIM's backend intelligence.
   */
  if (
    FOOTBALL_TRIGGERS.some(keyword =>
      q.includes(keyword)
    )
  ) {
    return null;
  }

  for (const item of APP_KNOWLEDGE_BASE) {
    if (
      item.keywords.some(keyword =>
        q.includes(keyword)
      )
    ) {
      return item.response;
    }
  }

  return null;
}

/* ============================================================
   HELPERS
============================================================ */

const generateChatTitle = text => {
  const title = String(text || '')
    .replace(/[?.!]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ');

  return title || 'New Chat';
};

const inferLoadingState = query => {
  const q = String(query || '').toLowerCase();

  if (
    /(predict|prediction|vs|versus|analyze|analysis|compare|h2h|form)/
      .test(q)
  ) {
    return 'Analyzing the matchup...';
  }

  if (
    /(today|tomorrow|fixture|live|score|playing|standings|table)/
      .test(q)
  ) {
    return 'Fetching football data...';
  }

  if (
    /(win|lost|history|who|when|what is|rule|law|offside)/
      .test(q)
  ) {
    return 'Checking football knowledge...';
  }

  return 'Thinking...';
};

const getEngineBadge = model => {
  if (!model) return null;

  const normalized = String(model).toLowerCase();

  if (
    normalized.includes('local-engine') ||
    normalized.includes('local-app') ||
    normalized.includes('strict-block')
  ) {
    return {
      icon: Brain,
      text: 'Verified Knowledge',
      cls: 'badge-local'
    };
  }

  if (normalized.includes('match-engine')) {
    return {
      icon: Activity,
      text: 'Live Match Data',
      cls: 'badge-match'
    };
  }

  if (normalized.includes('prediction-engine')) {
    return {
      icon: Target,
      text: 'Match Prediction',
      cls: 'badge-prediction'
    };
  }

  if (normalized.includes('gemini')) {
    return {
      icon: Sparkles,
      text: 'AI Analysis',
      cls: 'badge-ai'
    };
  }

  if (normalized.includes('cached')) {
    return {
      icon: Zap,
      text: 'Cached Response',
      cls: 'badge-cached'
    };
  }

  if (normalized.includes('reasoning')) {
    return {
      icon: Brain,
      text: 'KIM Reasoning',
      cls: 'badge-ai'
    };
  }

  return null;
};

const groupChatsByDate = chats => {
  const now = new Date();

  const today = [];
  const yesterday = [];
  const earlier = [];

  chats.forEach(chat => {
    if (!chat.createdAt) {
      earlier.push(chat);
      return;
    }

    const date = new Date(chat.createdAt);

    if (Number.isNaN(date.getTime())) {
      earlier.push(chat);
      return;
    }

    const diffDays = Math.floor(
      (now - date) /
        (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      today.push(chat);
    } else if (diffDays === 1) {
      yesterday.push(chat);
    } else {
      earlier.push(chat);
    }
  });

  return {
    today,
    yesterday,
    earlier
  };
};

const loadStoredChats = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      chat =>
        chat &&
        chat.id &&
        Array.isArray(chat.messages)
    );
  } catch (error) {
    console.warn(
      'KIM chat storage could not be loaded:',
      error
    );

    return [];
  }
};

/* ============================================================
   TYPEWRITER
============================================================ */

const TypewriterText = ({
  text,
  isActive,
  onComplete
}) => {
  const [displayed, setDisplayed] =
    useState('');

  const containerRef =
    useRef(null);

  const safeText =
    String(text || '');

  const getTypingSpeed = length => {
    if (length < 150) return 15;
    if (length < 400) return 8;
    return 4;
  };

  useEffect(() => {
    if (!isActive) {
      setDisplayed(safeText);

      if (onComplete) {
        onComplete();
      }

      return undefined;
    }

    setDisplayed('');

    let index = 0;

    const speed =
      getTypingSpeed(
        safeText.length
      );

    const timer = setInterval(() => {
      setDisplayed(
        safeText.substring(
          0,
          index
        )
      );

      index += 1;

      if (index > safeText.length) {
        clearInterval(timer);

        if (onComplete) {
          onComplete();
        }
      }
    }, speed);

    return () =>
      clearInterval(timer);
  }, [
    safeText,
    isActive,
    onComplete
  ]);

  useEffect(() => {
    if (
      isActive &&
      containerRef.current
    ) {
      containerRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'end'
      });
    }
  }, [
    displayed,
    isActive
  ]);

  const cleanFormat = str => {
    const normalized =
      String(str || '').replace(
        /\*\*(ZOKASCORE|Zokascore|zokascore)\*\*/gi,
        'ZOKASCORE'
      );

    return normalized
      .split('\n')
      .map((line, index) => {
        const trimmed =
          line.trim();

        if (!trimmed) {
          return (
            <br key={index} />
          );
        }

        if (
          trimmed.startsWith('- ') ||
          trimmed.startsWith('* ')
        ) {
          return (
            <div
              key={index}
              className="kim-bullet-item"
            >
              <span className="kim-bullet-dot">
                ●
              </span>

              <span className="kim-bullet-text">
                {trimmed.substring(2)}
              </span>
            </div>
          );
        }

        if (
          /^#{1,3}\s+/.test(
            trimmed
          )
        ) {
          return (
            <h4
              key={index}
              className="kim-text-heading"
            >
              {trimmed.replace(
                /^#{1,3}\s+/,
                ''
              )}
            </h4>
          );
        }

        return (
          <p
            key={index}
            className="kim-text-para"
          >
            {trimmed}
          </p>
        );
      });
  };

  return (
    <div ref={containerRef}>
      {cleanFormat(displayed)}

      {isActive && (
        <span className="typewriter-cursor" />
      )}
    </div>
  );
};

/* ============================================================
   MAIN KIM COMPONENT
============================================================ */

export default function ZokaAI({
  isOpen,
  onClose
}) {
  const { currentUser } =
    useAuth();

  const [chats, setChats] =
    useState(loadStoredChats);

  const [
    activeChatId,
    setActiveChatId
  ] = useState(null);

  const [input, setInput] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [
    loadingText,
    setLoadingText
  ] = useState('Thinking...');

  const [
    showSidebar,
    setShowSidebar
  ] = useState(false);

  const [error, setError] =
    useState(null);

  const [
    typingMessageId,
    setTypingMessageId
  ] = useState(null);

  const [
    isOnline,
    setIsOnline
  ] = useState(
    typeof navigator !== 'undefined'
      ? navigator.onLine
      : true
  );

  const [
    matchContext,
    setMatchContext
  ] = useState(null);

  const chatEndRef =
    useRef(null);

  const inputRef =
    useRef(null);

  const handleSendRef =
    useRef(null);

  const abortControllerRef =
    useRef(null);

  /* ----------------------------------------------------------
     DERIVED STATE
  ---------------------------------------------------------- */

  const activeChat = useMemo(
    () =>
      chats.find(
        chat =>
          chat.id === activeChatId
      ),
    [chats, activeChatId]
  );

  const messages =
    activeChat?.messages || [];

  const groupedChats =
    useMemo(
      () =>
        groupChatsByDate(chats),
      [chats]
    );

  /* ----------------------------------------------------------
     NETWORK STATE
  ---------------------------------------------------------- */

  useEffect(() => {
    const handleOnline = () =>
      setIsOnline(true);

    const handleOffline = () =>
      setIsOnline(false);

    window.addEventListener(
      'online',
      handleOnline
    );

    window.addEventListener(
      'offline',
      handleOffline
    );

    return () => {
      window.removeEventListener(
        'online',
        handleOnline
      );

      window.removeEventListener(
        'offline',
        handleOffline
      );
    };
  }, []);

  /* ----------------------------------------------------------
     PERSIST CHATS
  ---------------------------------------------------------- */

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(chats)
      );

      localStorage.setItem(
        `${STORAGE_KEY}_version`,
        String(STORAGE_VERSION)
      );
    } catch (storageError) {
      console.warn(
        'Unable to persist KIM chats:',
        storageError
      );
    }
  }, [chats]);

  /* ----------------------------------------------------------
     SCROLL
  ---------------------------------------------------------- */

  useEffect(() => {
    if (!typingMessageId) {
      chatEndRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, [
    messages,
    loading,
    typingMessageId
  ]);

  /* ----------------------------------------------------------
     OPEN / CLOSE
  ---------------------------------------------------------- */

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    } else {
      setShowSidebar(false);
      setError(null);
      setTypingMessageId(null);
      setMatchContext(null);

      /*
       * Cancel any request still running when KIM closes.
       */
      if (
        abortControllerRef.current
      ) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [isOpen]);

  /* ==========================================================
     CHAT MANAGEMENT
  ========================================================== */

  const startNewChat =
    useCallback(() => {
      setActiveChatId(null);
      setInput('');
      setError(null);
      setTypingMessageId(null);
      setMatchContext(null);
      setShowSidebar(false);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }, []);

  const deleteChat =
    useCallback(
      (id, event) => {
        event.stopPropagation();

        setChats(previous =>
          previous.filter(
            chat => chat.id !== id
          )
        );

        if (activeChatId === id) {
          setActiveChatId(null);
          setError(null);
          setTypingMessageId(null);
        }
      },
      [activeChatId]
    );

  /* ==========================================================
     BACKEND REQUEST
  ========================================================== */

  const sendMessageToBackend =
    useCallback(
      async (
        currentInput,
        chatId,
        historyOverride
      ) => {
        try {
          if (!isOnline) {
            throw new Error(
              'You are offline. Please check your connection.'
            );
          }

          /*
           * Cancel an older request.
           */
          if (
            abortControllerRef.current
          ) {
            abortControllerRef.current.abort();
          }

          const controller =
            new AbortController();

          abortControllerRef.current =
            controller;

          /*
           * IMPORTANT:
           * historyOverride contains the current user
           * message. This fixes the stale React state bug
           * in the previous implementation.
           */
          const history =
            Array.isArray(
              historyOverride
            )
              ? historyOverride
              : [];

          const authHeaders =
            currentUser
              ? await getAuthHeaders()
              : {};

          const response =
            await fetch(
              `${BACKEND_URL}/api/v1/ai/zoka`,
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                  ...authHeaders
                },

                body: JSON.stringify({
                  message:
                    currentInput,

                  history:
                    history
                      .slice(
                        -MAX_HISTORY_MESSAGES
                      )
                      .map(message => ({
                        role:
                          message.role,
                        content:
                          message.content
                      }))
                }),

                signal:
                  controller.signal
              }
            );

          /*
           * Some server/proxy failures may return HTML
           * instead of JSON.
           */
          const contentType =
            response.headers.get(
              'content-type'
            ) || '';

          let data;

          if (
            contentType.includes(
              'application/json'
            )
          ) {
            data =
              await response.json();
          } else {
            const text =
              await response.text();

            data = {
              success: false,
              error:
                text ||
                'The AI server returned an invalid response.'
            };
          }

          if (
            !response.ok ||
            !data?.success
          ) {
            throw new Error(
              data?.error ||
                'Failed to get a response from KIM.'
            );
          }

          const aiMsg = {
            role: 'assistant',
            content:
              data.reply ||
              'I received the request but could not generate a response.',
            model:
              data.model ||
              'kim-reasoning-engine',
            type:
              data.type ||
              'knowledge',
            data:
              data.data ||
              null,
            id:
              `${Date.now()}-ai`
          };

          setTypingMessageId(
            aiMsg.id
          );

          setChats(previous =>
            previous.map(chat => {
              if (
                chat.id !== chatId
              ) {
                return chat;
              }

              /*
               * Remove an existing error message when
               * the request succeeds.
               */
              const cleanMessages =
                chat.messages.filter(
                  message =>
                    !message.isError
                );

              /*
               * Avoid duplicate current user messages.
               */
              const alreadyHasUserMessage =
                cleanMessages.some(
                  message =>
                    message.role ===
                      'user' &&
                    message.content ===
                      currentInput
                );

              const finalMessages =
                alreadyHasUserMessage
                  ? [
                      ...cleanMessages,
                      aiMsg
                    ]
                  : [
                      ...cleanMessages,
                      {
                        role: 'user',
                        content:
                          currentInput,
                        id:
                          `${Date.now()}-user`
                      },
                      aiMsg
                    ];

              return {
                ...chat,
                messages:
                  finalMessages
              };
            })
          );

          return aiMsg;
        } catch (err) {
          /*
           * Abort is expected when KIM closes or a newer
           * request replaces the old one.
           */
          if (
            err?.name ===
            'AbortError'
          ) {
            return null;
          }

          console.error(
            'KIM request failed:',
            err
          );

          const message =
            err?.message ||
            'Something went wrong while contacting KIM.';

          const errorMsg = {
            role: 'assistant',
            content: message,
            isError: true,
            id:
              `${Date.now()}-error`
          };

          setChats(previous =>
            previous.map(chat =>
              chat.id === chatId
                ? {
                    ...chat,
                    messages: [
                      ...chat.messages,
                      errorMsg
                    ]
                  }
                : chat
            )
          );

          setError(message);

          return null;
        } finally {
          setLoading(false);

          if (
            abortControllerRef.current
          ) {
            abortControllerRef.current =
              null;
          }
        }
      },
      [currentUser, isOnline]
    );

  /* ==========================================================
     SEND
  ========================================================== */

  const handleSend =
    useCallback(
      async overrideText => {
        const textToSend = (
          overrideText ||
          input
        ).trim();

        if (
          !textToSend ||
          loading
        ) {
          return;
        }

        const currentInput =
          textToSend;

        setInput('');
        setError(null);
        setTypingMessageId(null);

        setLoadingText(
          inferLoadingState(
            currentInput
          )
        );

        /*
         * Create the chat immediately.
         */
        const newChatId =
          activeChatId ||
          `chat-${Date.now()}`;

        const userMsg = {
          role: 'user',
          content:
            currentInput,
          id:
            `user-${Date.now()}`
        };

        /*
         * Get the current conversation BEFORE mutation.
         */
        const existingChat =
          chats.find(
            chat =>
              chat.id ===
              newChatId
          );

        const existingMessages =
          existingChat?.messages ||
          [];

        /*
         * This is the exact history that will be sent
         * to the backend, including the current message.
         */
        const conversationForBackend =
          [
            ...existingMessages.filter(
              message =>
                !message.isError
            ),
            userMsg
          ];

        setChats(previous => {
          const existing =
            previous.find(
              chat =>
                chat.id ===
                newChatId
            );

          if (existing) {
            return previous.map(
              chat =>
                chat.id ===
                newChatId
                  ? {
                      ...chat,
                      messages: [
                        ...chat.messages,
                        userMsg
                      ]
                    }
                  : chat
            );
          }

          return [
            {
              id: newChatId,
              title:
                generateChatTitle(
                  currentInput
                ),
              createdAt:
                Date.now(),
              messages: [
                userMsg
              ]
            },
            ...previous
          ];
        });

        setActiveChatId(
          newChatId
        );

        setLoading(true);

        /*
         * ------------------------------------------------------
         * LOCAL APP KNOWLEDGE
         * ------------------------------------------------------
         */

        const localReply =
          interceptLocalQuery(
            currentInput
          );

        if (localReply) {
          const aiMsg = {
            role: 'assistant',
            content:
              localReply,
            model:
              'local-app',
            type:
              'knowledge',
            id:
              `local-${Date.now()}`
          };

          setTypingMessageId(
            aiMsg.id
          );

          setChats(previous =>
            previous.map(chat =>
              chat.id ===
              newChatId
                ? {
                    ...chat,
                    messages: [
                      ...chat.messages.filter(
                        message =>
                          message.id !==
                          aiMsg.id
                      ),
                      aiMsg
                    ]
                  }
                : chat
            )
          );

          setLoading(false);
          return;
        }

        /*
         * ------------------------------------------------------
         * BACKEND KIM
         * ------------------------------------------------------
         */

        await sendMessageToBackend(
          currentInput,
          newChatId,
          conversationForBackend
        );
      },
      [
        input,
        loading,
        activeChatId,
        chats,
        sendMessageToBackend
      ]
    );

  useEffect(() => {
    handleSendRef.current =
      handleSend;
  }, [handleSend]);

  /* ==========================================================
     RETRY
  ========================================================== */

  const handleRetry =
    useCallback(async () => {
      if (!activeChatId) {
        return;
      }

      const chat =
        chats.find(
          item =>
            item.id ===
            activeChatId
        );

      if (!chat) {
        return;
      }

      const lastUserMsg =
        [...chat.messages]
          .reverse()
          .find(
            message =>
              message.role ===
              'user'
          );

      if (!lastUserMsg) {
        return;
      }

      /*
       * Remove the failed assistant message.
       */
      const cleanMessages =
        chat.messages.filter(
          message =>
            !message.isError
        );

      setChats(previous =>
        previous.map(item =>
          item.id ===
          activeChatId
            ? {
                ...item,
                messages:
                  cleanMessages
              }
            : item
        )
      );

      setError(null);
      setLoading(true);
      setLoadingText(
        inferLoadingState(
          lastUserMsg.content
        )
      );

      /*
       * Send history WITHOUT the previous error.
       */
      await sendMessageToBackend(
        lastUserMsg.content,
        activeChatId,
        cleanMessages
      );
    }, [
      activeChatId,
      chats,
      sendMessageToBackend
    ]);

  /* ==========================================================
     EXTERNAL OPEN / MATCH CONTEXT
  ========================================================== */

  useEffect(() => {
    const handleExternalOpen =
      event => {
        const promptMessage =
          event.detail?.message;

        const context =
          event.detail?.matchContext;

        if (context) {
          setMatchContext(
            context
          );
        }

        if (
          promptMessage &&
          isOpen
        ) {
          setTimeout(() => {
            handleSendRef.current?.(
              promptMessage
            );
          }, 400);
        }
      };

    window.addEventListener(
      'openZokaAI',
      handleExternalOpen
    );

    return () =>
      window.removeEventListener(
        'openZokaAI',
        handleExternalOpen
      );
  }, [isOpen]);

  /* ==========================================================
     CHAT GROUP
  ========================================================== */

  const renderChatGroup = (
    title,
    chatsInGroup
  ) => {
    if (
      chatsInGroup.length === 0
    ) {
      return null;
    }

    return (
      <div className="kim-sidebar-group">
        <div className="kim-sidebar-group-title">
          {title}
        </div>

        {chatsInGroup.map(chat => (
          <div
            key={chat.id}
            onClick={() => {
              setActiveChatId(
                chat.id
              );

              setShowSidebar(
                false
              );

              setError(null);
              setTypingMessageId(
                null
              );
            }}
            className={`kim-chat-item ${
              activeChatId ===
              chat.id
                ? 'active'
                : ''
            }`}
          >
            <div className="kim-chat-item-info">
              <MessageSquare
                size={14}
              />

              <span className="kim-chat-title-text">
                {chat.title}
              </span>
            </div>

            <button
              onClick={event =>
                deleteChat(
                  chat.id,
                  event
                )
              }
              className="kim-chat-delete"
              title="Delete chat"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  /* ==========================================================
     MESSAGE RENDERING
  ========================================================== */

  const renderMessageContent =
    msg => {
      if (
        msg.data?.type ===
          'match' ||
        msg.data?.type ===
          'prediction'
      ) {
        return (
          <div>
            <TypewriterText
              text={msg.content}
              isActive={
                msg.id ===
                typingMessageId
              }
              onComplete={() =>
                setTypingMessageId(
                  null
                )
              }
            />

            <div className="kim-action-row">
              <button className="kim-action-link">
                View Match
                <ChevronRight
                  size={12}
                />
              </button>
            </div>
          </div>
        );
      }

      return (
        <TypewriterText
          text={msg.content}
          isActive={
            msg.id ===
            typingMessageId
          }
          onComplete={() =>
            setTypingMessageId(
              null
            )
          }
        />
      );
    };

  /* ==========================================================
     CLOSED
  ========================================================== */

  if (!isOpen) {
    return null;
  }

  /* ==========================================================
     UI
  ========================================================== */

  return (
    <>
      <div
        className="kim-backdrop"
        onClick={onClose}
      />

      <div className="kim-window">
        {showSidebar && (
          <div
            className="kim-sidebar-overlay"
            onClick={() =>
              setShowSidebar(false)
            }
          />
        )}

        {/* ====================================================
            SIDEBAR
        ==================================================== */}

        <div
          className={`kim-sidebar ${
            showSidebar
              ? 'open'
              : ''
          }`}
        >
          <div className="kim-sidebar-header">
            <span className="kim-sidebar-title">
              KIM
            </span>

            <button
              onClick={() =>
                setShowSidebar(false)
              }
              className="btn-icon btn-ghost"
            >
              <X size={18} />
            </button>
          </div>

          <div className="kim-sidebar-actions">
            <button
              onClick={
                startNewChat
              }
              className="btn btn-primary"
            >
              <Plus size={16} />
              New chat
            </button>
          </div>

          <div className="kim-sidebar-list">
            {chats.length ===
              0 && (
              <div className="kim-sidebar-empty">
                No recent chats.
              </div>
            )}

            {renderChatGroup(
              'TODAY',
              groupedChats.today
            )}

            {renderChatGroup(
              'YESTERDAY',
              groupedChats.yesterday
            )}

            {renderChatGroup(
              'EARLIER',
              groupedChats.earlier
            )}
          </div>
        </div>

        {/* ====================================================
            MAIN
        ==================================================== */}

        <div className="kim-main">
          {/* HEADER */}

          <div className="kim-header">
            <div className="kim-header-left">
              <button
                onClick={() =>
                  setShowSidebar(
                    previous =>
                      !previous
                  )
                }
                className="btn-icon btn-ghost"
              >
                <Menu size={20} />
              </button>

              <div className="kim-header-info">
                <div className="kim-avatar">
                  <Sparkles
                    size={16}
                    color="#fff"
                  />
                </div>

                <div>
                  <h2 className="kim-name">
                    Kim
                  </h2>

                  <span className="kim-status">
                    {!isOnline ? (
                      <>
                        <WifiOff
                          size={10}
                        />
                        Offline
                      </>
                    ) : (
                      'ZOKASCORE Intelligence'
                    )}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="btn-icon btn-ghost"
            >
              <X size={20} />
            </button>
          </div>

          {/* BODY */}

          <div className="kim-body">
            {messages.length ===
              0 && (
              <div className="kim-empty-state">
                <div className="kim-empty-icon">
                  <Sparkles
                    size={28}
                    color="#fff"
                  />
                </div>

                <h3>
                  Ask Kim
                </h3>

                <p>
                  {matchContext
                    ? `${matchContext.home} vs ${matchContext.away}`
                    : 'Football intelligence built into ZOKASCORE'}
                </p>

                <div className="kim-starters-grid">
                  {matchContext ? (
                    <>
                      <button
                        onClick={() =>
                          handleSend(
                            `Analyze ${matchContext.home} vs ${matchContext.away}`
                          )
                        }
                        className="kim-starter-btn"
                      >
                        <span className="kim-starter-icon">
                          🔮
                        </span>
                        Analyze this match
                      </button>

                      <button
                        onClick={() =>
                          handleSend(
                            `Predict ${matchContext.home} vs ${matchContext.away}`
                          )
                        }
                        className="kim-starter-btn"
                      >
                        <span className="kim-starter-icon">
                          📊
                        </span>
                        Give me a prediction
                      </button>

                      <button
                        onClick={() =>
                          handleSend(
                            `Who is likely to score in ${matchContext.home} vs ${matchContext.away}?`
                          )
                        }
                        className="kim-starter-btn"
                      >
                        <span className="kim-starter-icon">
                          ⚽
                        </span>
                        Who will score?
                      </button>

                      <button
                        onClick={() =>
                          handleSend(
                            `Compare recent form for ${matchContext.home} and ${matchContext.away}`
                          )
                        }
                        className="kim-starter-btn"
                      >
                        <span className="kim-starter-icon">
                          📈
                        </span>
                        Compare form
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() =>
                          handleSend(
                            'What matches are playing today?'
                          )
                        }
                        className="kim-starter-btn"
                      >
                        <span className="kim-starter-icon">
                          ⚽
                        </span>
                        Today's matches
                      </button>

                      {currentUser && (
                        <button
                          onClick={() =>
                            handleSend(
                              'What are my prediction stats?'
                            )
                          }
                          className="kim-starter-btn"
                        >
                          <span className="kim-starter-icon">
                            📊
                          </span>
                          My prediction stats
                        </button>
                      )}

                      <button
                        onClick={() =>
                          handleSend(
                            'Explain the offside rule'
                          )
                        }
                        className="kim-starter-btn"
                      >
                        <span className="kim-starter-icon">
                          🧠
                        </span>
                        Ask about football
                      </button>

                      <button
                        onClick={() =>
                          handleSend(
                            'Analyze Arsenal vs Chelsea'
                          )
                        }
                        className="kim-starter-btn"
                      >
                        <span className="kim-starter-icon">
                          🔮
                        </span>
                        Analyze a match
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ==================================================
                MESSAGES
            ================================================== */}

            {messages.map(
              (msg, index) => {
                const badge =
                  msg.role ===
                  'assistant'
                    ? getEngineBadge(
                        msg.model
                      )
                    : null;

                const BadgeIcon =
                  badge?.icon;

                return (
                  <div
                    key={
                      msg.id ||
                      index
                    }
                    className={`kim-msg-row ${
                      msg.role ===
                      'user'
                        ? 'user'
                        : 'ai'
                    }`}
                  >
                    {msg.role !==
                      'user' && (
                      <div className="kim-msg-avatar">
                        <Sparkles
                          size={14}
                          color="#fff"
                        />
                      </div>
                    )}

                    <div
                      className={`kim-bubble ${
                        msg.role ===
                        'user'
                          ? 'user'
                          : 'ai'
                      } ${
                        msg.isError
                          ? 'error'
                          : ''
                      }`}
                    >
                      {badge &&
                        !msg.isError && (
                          <div
                            className={`kim-engine-badge ${badge.cls}`}
                          >
                            <BadgeIcon
                              size={9}
                            />
                            {badge.text}
                          </div>
                        )}

                      {msg.isError ? (
                        <div className="kim-error-content">
                          <AlertCircle
                            size={14}
                          />

                          <span>
                            {msg.content}
                          </span>

                          <button
                            onClick={
                              handleRetry
                            }
                            className="kim-retry-btn"
                          >
                            <RefreshCw
                              size={12}
                            />
                            Retry
                          </button>
                        </div>
                      ) : msg.role ===
                        'assistant' ? (
                        renderMessageContent(
                          msg
                        )
                      ) : (
                        <div className="kim-user-text">
                          {msg.content}
                        </div>
                      )}
                    </div>

                    {msg.role ===
                      'user' && (
                      <div className="kim-msg-avatar user">
                        <User
                          size={14}
                          color="#fff"
                        />
                      </div>
                    )}
                  </div>
                );
              }
            )}

            {/* LOADING */}

            {loading &&
              !typingMessageId && (
                <div className="kim-msg-row ai">
                  <div className="kim-msg-avatar">
                    <Sparkles
                      size={14}
                      color="#fff"
                    />
                  </div>

                  <div className="kim-bubble ai loading">
                    <Loader
                      size={14}
                      className="anim-spin"
                    />

                    <span>
                      {loadingText}
                    </span>
                  </div>
                </div>
              )}

            <div
              ref={chatEndRef}
            />
          </div>

          {/* INPUT */}

          <div className="kim-input-area">
            <div className="kim-input-wrap">
              <input
                ref={inputRef}
                value={input}
                onChange={event =>
                  setInput(
                    event.target
                      .value
                  )
                }
                onKeyDown={event => {
                  if (
                    event.key ===
                      'Enter' &&
                    !event.shiftKey
                  ) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  loading
                    ? 'Kim is thinking...'
                    : !isOnline
                      ? "You're offline"
                      : 'Ask Kim anything about football...'
                }
                className="kim-input"
                disabled={
                  loading ||
                  !isOnline
                }
                autoComplete="off"
              />

              <button
                onClick={() =>
                  handleSend()
                }
                disabled={
                  loading ||
                  !input.trim() ||
                  !isOnline
                }
                className={`kim-send-btn ${
                  !input.trim() ||
                  loading ||
                  !isOnline
                    ? 'disabled'
                    : ''
                }`}
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}