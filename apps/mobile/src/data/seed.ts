import { Snapshot, starterGroups } from '@unicore/shared';

// Relative dates keep a fresh installation useful for demonstrations.
export function createSeed(): Snapshot {
  const date = (days: number, hour: number) => {
    const value = new Date();
    value.setDate(value.getDate() + days);
    value.setHours(hour, 0, 0, 0);
    return value.toISOString();
  };
  return {
    version: 1,
    groups: starterGroups,
    session: false,
    profile: {
      id: 'demo-student',
      name: 'Саша',
      email: 'student@example.com',
      faculty: 'ИМИТ',
      course: '4',
      group: 'ПИ-231',
      bio: 'Делаю первый pet-проект. Ищу людей, с которыми можно создавать классные вещи',
      interests: ['Карьера', 'Общение', 'Учёба'],
    },
    joinedIds: [],
    savedIds: [],
    activities: [
      {
        id: 'hackathon',
        kind: 'event',
        title: 'Идеи, кофе,\nпервый стартап',
        category: 'Карьера',
        description:
          'Два дня, чтобы превратить идею в работающий прототип. Собираем команды из разработчиков, дизайнеров и тех, кому просто интересно попробовать. Опыт не обязателен: менторы помогут на каждом этапе.\n\nВ программе: знакомство, питч идей, работа в командах и финальная презентация. Возьми ноутбук и зарядку. Это демонстрационное событие, реальной регистрации нет',
        startsAt: date(3, 10),
        location: 'ВолГУ · коворкинг, корпус А',
        host: 'Стартап-клуб',
        hostId: 'startup',
        hostInfo: 'Студенческое сообщество',
        attendees: 42,
        capacity: 80,
        tags: ['Хакатон', 'Для всех курсов'],
        featured: true,
      },
      {
        id: 'design',
        kind: 'event',
        title: 'Дизайн, который решает',
        category: 'Творчество',
        description:
          'Открытая встреча о продуктовом дизайне. Разберём интерфейсы студенческих проектов и попробуем улучшить один из них вместе. Можно прийти без портфолио. Событие вымышленное',
        startsAt: date(1, 17),
        location: 'ВолГУ · аудитория 3-12',
        host: 'Дизайн-клуб',
        hostId: 'design-club',
        hostInfo: 'Творческое сообщество',
        attendees: 18,
        capacity: 35,
        tags: ['Лекция', 'UX/UI'],
      },
      {
        id: 'science',
        kind: 'event',
        title: 'Наука без сложных слов',
        category: 'Учёба',
        description:
          'Молодые исследователи рассказывают о своих проектах за пять минут. После выступлений — вопросы и свободное общение. Все данные демонстрационные',
        startsAt: date(2, 15),
        location: 'ВолГУ · научная библиотека',
        host: 'Научное общество',
        hostId: 'science-club',
        hostInfo: 'Студенческое сообщество',
        attendees: 26,
        capacity: 60,
        tags: ['Наука', 'Открытая встреча'],
      },
      {
        id: 'volley',
        kind: 'invite',
        title: 'Волейбол после пар',
        category: 'Спорт',
        description:
          'Нас уже четверо, ищем ещё двоих на дружескую игру. Уровень любой, главное — желание двигаться. Мяч есть, возьми удобную обувь. Это пример события',
        startsAt: date(1, 18),
        location: 'Спортплощадка у корпуса Б',
        host: 'Даня',
        hostId: 'danya',
        hostInfo: 'ИМИТ · 3 курс',
        attendees: 4,
        capacity: 6,
        tags: ['Любой уровень', 'После пар'],
      },
      {
        id: 'team',
        kind: 'invite',
        title: 'Соберём команду на хакатон?',
        category: 'Карьера',
        description:
          'Делаем сервис для студентов. Уже есть frontend-разработчик, ищем дизайнера и человека, которому интересен backend. Сначала познакомимся и обсудим идеи за кофе. Демонстрационный событие',
        startsAt: date(2, 16),
        location: 'Кофейня у главного входа',
        host: 'Аня',
        hostId: 'anya',
        hostInfo: 'ИМИТ · 4 курс',
        attendees: 2,
        capacity: 5,
        tags: ['React', 'Дизайн', 'Team-up'],
      },
      {
        id: 'boardgames',
        kind: 'invite',
        title: 'Настолки и новые знакомые',
        category: 'Общение',
        description:
          'Играем в простые настолки и знакомимся. Правила объясним на месте, новичкам очень рады. Приходи один или с другом. Это вымышленная встреча',
        startsAt: date(1, 19),
        location: 'Студенческий центр · 2 этаж',
        host: 'Маша',
        hostId: 'masha',
        hostInfo: 'ИФИМК · 2 курс',
        attendees: 5,
        capacity: 8,
        tags: ['Новичкам рады', 'Настолки'],
      },
      {
        id: 'exam',
        kind: 'invite',
        title: 'Разберём матан вместе',
        category: 'Учёба',
        description:
          'Готовимся к коллоквиуму: пределы, производные и несколько задач из методички. Возьми конспект и вопросы. Свободные места закончились — пример заполненного события',
        startsAt: date(2, 14),
        location: 'Библиотека · тихий зал',
        host: 'Илья',
        hostId: 'ilya',
        hostInfo: 'ИМИТ · 1 курс',
        attendees: 4,
        capacity: 4,
        tags: ['Математика', 'Подготовка'],
      },
    ],
  };
}
