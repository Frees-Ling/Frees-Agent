import { createHash, randomBytes } from 'node:crypto';

export function slugify(value, fallback = 'default') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return normalized || fallback;
}

export function shortHash(value) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, 8);
}

// ---- Random word slug generator ----

const ADJECTIVES = [
  'abundant', 'ancient', 'bright', 'calm', 'cheerful', 'clever', 'cozy', 'curious',
  'dapper', 'dazzling', 'deep', 'delightful', 'eager', 'elegant', 'enchanted', 'fancy',
  'fluffy', 'gentle', 'gleaming', 'golden', 'graceful', 'happy', 'hidden', 'humble',
  'jolly', 'joyful', 'keen', 'kind', 'lively', 'lovely', 'lucky', 'luminous',
  'magical', 'majestic', 'mellow', 'merry', 'mighty', 'misty', 'noble', 'peaceful',
  'playful', 'polished', 'precious', 'proud', 'quiet', 'quirky', 'radiant', 'rosy',
  'serene', 'shiny', 'silly', 'sleepy', 'smooth', 'snazzy', 'snug', 'soft',
  'sparkling', 'spicy', 'splendid', 'starry', 'steady', 'sunny', 'swift', 'tender',
  'tidy', 'tranquil', 'twinkly', 'valiant', 'vast', 'velvet', 'vivid', 'warm',
  'whimsical', 'wild', 'wise', 'witty', 'wondrous', 'zany', 'zesty', 'zippy',
  'breezy', 'bubbly', 'buzzing', 'cheeky', 'cosmic', 'crispy', 'crystalline', 'cuddly',
  'dreamy', 'effervescent', 'ethereal', 'fizzy', 'flickering', 'floating', 'floofy', 'fluttering',
  'foamy', 'frolicking', 'fuzzy', 'giggly', 'glimmering', 'glistening', 'glittery', 'glowing',
  'goofy', 'groovy', 'harmonic', 'hazy', 'humming', 'iridescent', 'jaunty', 'jazzy',
  'jiggly', 'melodic', 'moonlit', 'mossy', 'nifty', 'peppy', 'purring', 'quizzical',
  'rippling', 'rustling', 'shimmering', 'shimmying', 'snappy', 'squishy', 'swirling', 'ticklish',
  'tingly', 'twinkling', 'velvety', 'wiggly', 'wobbly', 'woolly',
  'abstract', 'adaptive', 'agile', 'async', 'atomic', 'binary', 'cached', 'compiled',
  'composed', 'compressed', 'concurrent', 'cryptic', 'curried', 'declarative', 'delegated', 'distributed',
  'dynamic', 'eager', 'elegant', 'encapsulated', 'enumerated', 'eventual', 'expressive', 'federated',
  'functional', 'generic', 'greedy', 'hashed', 'idempotent', 'immutable', 'imperative', 'indexed',
  'inherited', 'iterative', 'lazy', 'lexical', 'linear', 'linked', 'logical', 'memoized',
  'modular', 'mutable', 'nested', 'optimized', 'parallel', 'parsed', 'partitioned', 'piped',
  'polymorphic', 'pure', 'reactive', 'recursive', 'refactored', 'reflective', 'replicated', 'resilient',
  'robust', 'scalable', 'sequential', 'serialized', 'sharded', 'sorted', 'staged', 'stateful',
  'stateless', 'streamed', 'structured', 'synchronous', 'synthetic', 'temporal', 'transient', 'typed',
  'unified', 'validated', 'vectorized', 'virtual',
];

const NOUNS = [
  'aurora', 'avalanche', 'blossom', 'breeze', 'brook', 'bubble', 'canyon', 'cascade',
  'cloud', 'clover', 'comet', 'coral', 'cosmos', 'creek', 'crescent', 'crystal',
  'dawn', 'dewdrop', 'dusk', 'eclipse', 'ember', 'feather', 'fern', 'firefly',
  'flame', 'flurry', 'fog', 'forest', 'frost', 'galaxy', 'garden', 'glacier',
  'glade', 'grove', 'harbor', 'horizon', 'island', 'lagoon', 'lake', 'leaf',
  'lightning', 'meadow', 'meteor', 'mist', 'moon', 'moonbeam', 'mountain', 'nebula',
  'nova', 'ocean', 'orbit', 'pebble', 'petal', 'pine', 'planet', 'pond',
  'puddle', 'quasar', 'rain', 'rainbow', 'reef', 'ripple', 'river', 'shore',
  'sky', 'snowflake', 'spark', 'spring', 'star', 'stardust', 'starlight', 'storm',
  'stream', 'summit', 'sun', 'sunbeam', 'sunrise', 'sunset', 'thunder', 'tide',
  'twilight', 'valley', 'volcano', 'waterfall', 'wave', 'willow', 'wind',
  'alpaca', 'axolotl', 'badger', 'bear', 'beaver', 'bee', 'bird', 'bumblebee',
  'bunny', 'cat', 'chipmunk', 'crab', 'crane', 'deer', 'dolphin', 'dove',
  'dragon', 'dragonfly', 'duckling', 'eagle', 'elephant', 'falcon', 'finch', 'flamingo',
  'fox', 'frog', 'giraffe', 'goose', 'hamster', 'hare', 'hedgehog', 'hippo',
  'hummingbird', 'jellyfish', 'kitten', 'koala', 'ladybug', 'lark', 'lemur', 'llama',
  'lobster', 'lynx', 'manatee', 'meerkat', 'moth', 'narwhal', 'newt', 'octopus',
  'otter', 'owl', 'panda', 'parrot', 'peacock', 'pelican', 'penguin', 'phoenix',
  'piglet', 'platypus', 'pony', 'porcupine', 'puffin', 'puppy', 'quail', 'quokka',
  'rabbit', 'raccoon', 'raven', 'robin', 'salamander', 'seahorse', 'seal', 'sloth',
  'snail', 'sparrow', 'sphinx', 'squid', 'squirrel', 'starfish', 'swan', 'tiger',
  'toucan', 'turtle', 'unicorn', 'walrus', 'whale', 'wolf', 'wombat', 'wren', 'yeti', 'zebra',
  'acorn', 'anchor', 'balloon', 'beacon', 'biscuit', 'blanket', 'book', 'boot',
  'cake', 'candle', 'candy', 'castle', 'charm', 'clock', 'cocoa', 'cookie',
  'crayon', 'crown', 'cupcake', 'donut', 'dream', 'fairy', 'fiddle', 'flask',
  'flute', 'fountain', 'gadget', 'gem', 'gizmo', 'globe', 'goblet', 'hammock',
  'harp', 'haven', 'hearth', 'honey', 'journal', 'kazoo', 'kettle', 'key',
  'kite', 'lantern', 'lemon', 'lighthouse', 'locket', 'lollipop', 'mango', 'map',
  'marble', 'marshmallow', 'melody', 'mitten', 'mochi', 'muffin', 'music', 'nest',
  'noodle', 'oasis', 'origami', 'pancake', 'parasol', 'peach', 'pearl', 'pie',
  'pillow', 'pinwheel', 'pixel', 'pizza', 'plum', 'popcorn', 'pretzel', 'prism',
  'pudding', 'pumpkin', 'puzzle', 'quiche', 'quill', 'quilt', 'riddle', 'rocket',
  'rose', 'scone', 'scroll', 'shell', 'sketch', 'snowglobe', 'sonnet', 'sparkle',
  'spindle', 'sprout', 'sundae', 'swing', 'taco', 'teacup', 'teapot', 'thimble',
  'toast', 'token', 'tome', 'tower', 'treasure', 'treehouse', 'trinket', 'truffle',
  'tulip', 'umbrella', 'waffle', 'wand', 'whisper', 'whistle', 'widget', 'wreath', 'zephyr',
  'hopper', 'knuth', 'lamport', 'lovelace', 'turing', 'ritchie', 'thompson', 'torvalds',
  'stroustrup', 'gosling', 'hickey', 'hejlsberg', 'matsumoto', 'wall', 'pike', 'eich',
];

const VERBS = [
  'baking', 'beaming', 'booping', 'bouncing', 'brewing', 'bubbling', 'chasing', 'churning',
  'coalescing', 'conjuring', 'cooking', 'crafting', 'crunching', 'cuddling', 'dancing', 'dazzling',
  'discovering', 'doodling', 'dreaming', 'drifting', 'enchanting', 'exploring', 'finding', 'floating',
  'fluttering', 'foraging', 'forging', 'frolicking', 'gathering', 'giggling', 'gliding', 'greeting',
  'growing', 'hatching', 'herding', 'honking', 'hopping', 'hugging', 'humming', 'imagining',
  'inventing', 'jingling', 'juggling', 'jumping', 'kindling', 'knitting', 'launching', 'leaping',
  'mapping', 'marinating', 'meandering', 'mixing', 'moseying', 'munching', 'napping', 'nibbling',
  'noodling', 'orbiting', 'painting', 'percolating', 'petting', 'plotting', 'pondering', 'popping',
  'prancing', 'purring', 'puzzling', 'questing', 'riding', 'roaming', 'rolling', 'scribbling',
  'seeking', 'shimmying', 'singing', 'skipping', 'sleeping', 'snacking', 'sniffing', 'snuggling',
  'soaring', 'sparking', 'spinning', 'splashing', 'sprouting', 'squishing', 'stargazing', 'stirring',
  'strolling', 'swimming', 'swinging', 'tickling', 'tinkering', 'toasting', 'tumbling', 'twirling',
  'waddling', 'wandering', 'watching', 'weaving', 'whistling', 'wiggling', 'wishing', 'wobbling',
  'wondering', 'yawning', 'zooming',
];

function randomInt(max) {
  const bytes = randomBytes(4);
  return bytes.readUInt32BE(0) % max;
}

function pickRandom(array) {
  return array[randomInt(array.length)];
}

/**
 * Generate a random word slug in the format "adjective-verb-noun"
 * Example: "gleaming-brewing-phoenix", "cosmic-pondering-lighthouse"
 */
export function generateWordSlug() {
  return `${pickRandom(ADJECTIVES)}-${pickRandom(VERBS)}-${pickRandom(NOUNS)}`;
}

/**
 * Generate a shorter random word slug in the format "adjective-noun"
 * Example: "graceful-unicorn", "cosmic-lighthouse"
 */
export function generateShortWordSlug() {
  return `${pickRandom(ADJECTIVES)}-${pickRandom(NOUNS)}`;
}
