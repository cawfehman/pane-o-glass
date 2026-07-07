const WORD_LIST = [
    "apple", "apricot", "avocado", "banana", "blackberry", "blueberry", "cherry", "coconut", "cranberry", "grape",
    "grapefruit", "lemon", "lime", "mango", "melon", "nectarine", "orange", "papaya", "peach", "pear",
    "pineapple", "plum", "pomegranate", "raspberry", "strawberry", "tangerine", "watermelon", "acorn", "almond", "cashew",
    "chestnut", "hazelnut", "macadamia", "peanut", "pecan", "pistachio", "walnut", "artichoke", "asparagus", "bamboo",
    "broccoli", "cabbage", "carrot", "cauliflower", "celery", "cucumber", "eggplant", "garlic", "ginger", "lettuce",
    "mushroom", "onion", "pepper", "potato", "pumpkin", "radish", "spinach", "tomato", "turnip", "zucchini",
    "anchor", "anvil", "arrow", "axe", "balloon", "barrel", "basket", "bell", "belt", "blade",
    "blanket", "book", "bottle", "bowl", "box", "bridge", "broom", "brush", "bucket", "button",
    "cable", "candle", "canvas", "carpet", "chain", "chair", "chalk", "chisel", "clock", "comb",
    "compass", "cradle", "cup", "curtain", "desk", "dial", "door", "drum", "envelope", "eraser",
    "fan", "feather", "file", "flag", "flute", "fork", "frame", "funnel", "glove", "hammer",
    "hanger", "hat", "helmet", "hook", "ink", "jacket", "jar", "key", "kite", "knife",
    "ladder", "lamp", "lantern", "lock", "magnet", "map", "mask", "match", "mirror", "needle",
    "net", "padlock", "paper", "pen", "pencil", "pillow", "pipe", "plate", "pocket", "pot",
    "purse", "quill", "ring", "rope", "ruler", "saddle", "saw", "scale", "scissors", "screw",
    "scythe", "shield", "shoe", "shovel", "sieve", "soap", "spoon", "stamp", "stone", "suit",
    "table", "tack", "thread", "ticket", "torch", "towel", "toy", "tray", "trumpet", "tub",
    "umbrella", "vase", "violin", "wagon", "watch", "whip", "whistle", "window", "wire", "wrench",
    "badger", "beaver", "bison", "camel", "cheetah", "chimpanzee", "chipmunk", "cougar", "coyote", "deer",
    "dolphin", "donkey", "elephant", "elk", "falcon", "ferret", "fox", "giraffe", "goat", "gorilla",
    "hare", "hedgehog", "hippopotamus", "horse", "jaguar", "kangaroo", "koala", "leopard", "lion", "llama",
    "moose", "octopus", "otter", "panda", "panther", "parrot", "penguin", "puma", "rabbit", "raccoon"
];

export function getRotatingPassword(offsetMinutes = 0) {
    const timeIndex = Math.floor((Date.now() + offsetMinutes * 60 * 1000) / 120000);
    const index = Math.abs(timeIndex) % WORD_LIST.length;
    return WORD_LIST[index];
}

export function verifyRotatingPassword(input: string): boolean {
    const cleanInput = input.trim().toLowerCase();
    // Allow current word and previous word to handle time boundaries gracefully
    return cleanInput === getRotatingPassword(0) || cleanInput === getRotatingPassword(-2);
}
