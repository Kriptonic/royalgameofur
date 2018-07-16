const Player = require('./Player');

module.exports = Game;

/**
 * The Game object stores details about the state of the current game with supporting methods to help determine the
 * allowed moves.
 *
 * @param {string|number} pid1 The id of player 1.
 * @param {string|number} pid2 The id of player 2.
 * @constructor
 */
function Game (pid1, pid2) {

  /**
   * The data representing player 1.
   *
   * @type {Player} The player object.
   */
  this.player1 = new Player(pid1, 1);

  /**
   * The data representing player 2.
   *
   * @type {Player} The player object.
   */
  this.player2 = new Player(pid2, 2);

  /**
   * The id of the player whose turn it is.
   *
   * @type {?number} The id of the current player.
   */
  this.currentPlayer = null;

  /**
   * The value of the last dice roll.
   *
   * @type {?int} The value of the last dice roll or null if the roll hasn't happened yet.
   */
  this.currentRoll = null;

  /**
   * The id for this game.
   *
   * @type {?string} The identifier for this game or null if it hasn't been set yet.
   */
  this.id = null;

  /**
   * The number of turns played in this game.
   *
   * @type {int} The number of turns.
   */
  this.turn = 0;

  /**
   * A collection of messages generated by this game.
   *
   * @type {Array.<string>} The messages for this game.
   */
  this.messages = [];

  /**
   * The current game state.
   *
   * @type {int} 0: no state; 1: in progress; 2: finished.
   */
  this.state = 0;

  /**
   * The track stores the positions of players along the board.
   *
   * Note that bitwise operations are used to store the location of player 1 and player 2 in a single integer.
   * This is only for cells 1, 2, 3, 4, 13, and 14 where the cells can't knock each other off the track.
   *
   * @type {Object.<int, int>} The board state with player locations.
   */
  this.track = this.getTrack();
}

/**
 * Hydrate the Game object with the data provided.
 * Useful for reconstructing the game from an object.
 *
 * @param {Object} data An object containing game data.
 */
Game.prototype.hydrate = function (data) {
  const properties = Object.keys(this);

  for (let i = 0; i < properties.length; i++) {
    this[properties[i]] = data[properties[i]];
  }
};

/**
 * Get the value of a random dice roll - based on 4 coin flips.
 *
 * @returns {number} The value of the rolled dice.
 */
Game.prototype.rollDice = function () {

  // The number of movement points are decided by 4 coin flips.
  let dieValue = 0;

  for (let i in [1, 2, 3, 4]) {
    dieValue += Math.random() > 0.5;
  }

  return dieValue;
};

/**
 * Get a track object structured for easy comparison.
 *
 * @returns {Object.<int,int>} The pre-populated track.
 */
Game.prototype.getTrack = function () {
  return (new Array(15)).fill(0);
};

/**
 * Checks whether a move is valid.
 *
 * @param {int} track The numerical index along the path that was selected.
 * @param {string} lane The name of the lane selected.
 * @returns {boolean} True if the move was valid; false otherwise.
 */
Game.prototype.isValidMove = function (track, lane) {

  if (lane === 'enemy') {
    // It doesn't matter what track piece was selected if it belongs in the enemy lane.
    return false;
  }

  return this.getValidMoves()[track];
};

/**
 * Calculate the valid moves that this player can make.
 *
 * @returns {Object.<number,boolean>} An object containing the track position and a bool for whether the move is valid.
 */
Game.prototype.getValidMoves = function () {

  const moves = {};

  if (this.currentRoll === null) {
    // A move cannot be made until we know the move count.
    return moves;
  }

  // First we need to know what valid moves there are for
  // the current player.
  const player = this.getCurrentPlayer();

  // Look along the track to see if there are any tokens
  // that can be moved with the current roll.
  for (let i = 0; i <= 14; i++) {

    // By default we can't move; we will change this value if we can move later.
    moves[i] = false;

    // If it is the starting cell then it is only valid if we have tokens and all the rules below apply.
    if (i === 0 && player.tokensWaiting === 0) {
      continue;
    }

    // Can't move from here if we don't have a token on this spot.
    // Doesn't apply to start tiles as they never actually have tokens.
    if ((this.track[i] & player.number) !== player.number && i !== 0) {
      continue;
    }

    // A token for this player was found - figure out if it can be moved to the destination.

    const destination = i + this.currentRoll;

    // Cannot move onto your own token.
    if ((this.track[destination] & player.number) === player.number) {
      continue;
    }

    // There is a token on the protected cell.
    if (destination === 8 && this.track[destination] > 0) {
      continue;
    }

    // We're near the end but don't have the exact roll to remove our token from the board.
    if (destination > 15) {
      continue;
    }

    // We can make this move.
    moves[i] = true;
  }

  return moves;
};

/**
 * Get the values of this object.
 *
 * @param {object} obj The object to get the values from.
 * @returns {[]} An array of values from the provided object.
 */
Game.prototype.getValues = function (obj) {
  return Object.keys(obj).map((k) => obj[k]);
};

/**
 * Check to see if there are any valid moves for the current player.
 *
 * @returns {boolean} True if the current player has valid moves; false otherwise.
 */
Game.prototype.hasValidMoves = function () {

  // Collate all the booleans representing valid moves for each position on the track [true, false, false, true, etc].
  const validMovesBoolArray = this.getValues(this.getValidMoves());

  // Sum all the booleans - a non-zero value indicates a number of valid moves.
  const numberOfValidMoves = validMovesBoolArray.reduce(function (boolean, sumOfBooleans) {
    return sumOfBooleans + boolean;
  }, 0);

  return numberOfValidMoves > 0;
};

/**
 * Get the current player's player object.
 *
 * @returns {Player} The player object for the current player.
 */
Game.prototype.getCurrentPlayer = function () {
  return this.currentPlayer === this.player1.pid ? this.player1 : this.player2;
};

/**
 * Get the enemy player's player object.
 *
 * @returns {Player} The player object for the enemy player.
 */
Game.prototype.getEnemyPlayer = function () {
  return this.currentPlayer === this.player1.pid ? this.player2 : this.player1;
};

/**
 * Get the player object for the provided player pid.
 *
 * @param {int} pid The player id of the player we want the player object for.
 * @returns {Player} The player object for the provided player id.
 */
Game.prototype.getPlayerById = function (pid) {
  return this.player1.pid === pid ? this.player1 : this.player2;
};

/**
 * Get the player object for the player number provided.
 *
 * @param {int} number The number of the player to get the player object for.
 * @returns {Player} The player object for the provided player number.
 */
Game.prototype.getPlayerByNumber = function (number) {
  return number === 1 ? this.player1 : this.player2;
};

/**
 * Get the enemy of the player id provided.
 *
 * @param {int} pid The id of the player to get the enemy of.
 * @returns {Player} The player object for the enemy of the pid.
 */
Game.prototype.getEnemyOfPlayerId = function (pid) {
  return this.currentPlayer === pid ? this.getEnemyPlayer() : this.getCurrentPlayer();
};

/**
 * Switch the current player.
 */
Game.prototype.switchCurrentPlayer = function () {
  this.currentPlayer = this.getEnemyPlayer().pid;
};

/**
 * Advance the game to the next turn.
 */
Game.prototype.nextTurn = function () {

  // Increment the turn counter.
  this.turn += 1;

  // Reset the dice.
  this.currentRoll = null;

};

/**
 * Add a message to the game log.
 *
 * @param {string|number} message The message to add to the game log.
 */
Game.prototype.log = function (message) {

  // Add the message to the game.
  this.messages.push({
    message: message,
    turn: this.turn
  });

  // Show the message in the console.
  console.log(message);
};
