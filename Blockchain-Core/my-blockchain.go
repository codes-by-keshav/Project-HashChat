//my-blockchain.go

package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"golang.org/x/crypto/sha3"
)

// const MaxBlockSize = 10 * 1024 * 1024 // 10 MB in bytes when file sharing will be added
const MaxBlockSize = 5 * 1024 // 5 KB in bytes

// Block represents a block in the blockchain
type Block struct {
	Index        int       `json:"index"`
	Timestamp    int64     `json:"timestamp"`
	Messages     []Message `json:"messages"` // Change this from MessageMetadata to Message
	PreviousHash string    `json:"previous_hash"`
	Hash         string    `json:"hash"`
	Size         int       `json:"size"`
}

// Blockchain manages the chain of blocks and pending messages
type Blockchain struct {
	mu              sync.RWMutex
	chain           []Block
	pendingMessages []Message
	messageChan     chan Message
	encryptionQueue chan Message
	encryptionKey   string
}

// Message represents a single chat message
type Message struct {
	Sender      string `json:"sender"`
	Receiver    string `json:"receiver"`
	Content     []byte `json:"content"`
	RequestTime int64  `json:"request_time"`
}

type Config struct {
	EncryptionKey string `json:"encryption_key"`
}

func loadConfig() (*Config, error) {
	file, err := os.Open("encryption_key.json")
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var config Config
	decoder := json.NewDecoder(file)
	err = decoder.Decode(&config)
	if err != nil {
		return nil, err
	}

	return &config, nil
}

// var blockchain *Blockchain
// var distributedStorage *DistributedStorage

// NewBlockchain creates a new blockchain with a genesis block
func NewBlockchain(encryptionKey string) *Blockchain {
	genesisMessage := Message{
		Sender:      "system",
		Receiver:    "system",
		Content:     []byte("Welcome to the blockchain!"),
		RequestTime: time.Now().Unix(),
	}
	genesisBlock := Block{
		Index:        0,
		Timestamp:    time.Now().Unix(),
		Messages:     []Message{genesisMessage},
		PreviousHash: "null",
		Hash:         "",
	}
	genesisBlock.Hash = calculateBlockHash(genesisBlock)
	bc := &Blockchain{
		chain:           []Block{genesisBlock},
		messageChan:     make(chan Message, 1000),
		encryptionQueue: make(chan Message, 1000),
		encryptionKey:   encryptionKey,
	}

	go bc.processMessages()
	go bc.encryptMessages()
	return bc
}

func (bc *Blockchain) mineBlock(messages []Message) {
	newBlock := Block{
		Index:        len(bc.chain),
		Timestamp:    time.Now().Unix(),
		Messages:     messages,
		PreviousHash: bc.getLatestBlock().Hash,
		Hash:         "",
	}

	blockSize := 0
	for _, msg := range messages {
		blockSize += estimateMessageSize(msg)
	}
	newBlock.Size = blockSize

	newBlock.Hash = calculateBlockHash(newBlock)
	bc.chain = append(bc.chain, newBlock)

	fmt.Printf("Block mined: %d with %d messages, size: %d bytes\n", newBlock.Index, len(messages), newBlock.Size)
}

// calculateBlockHash calculates the SHA256 hash of a block
func calculateBlockHash(block Block) string {
	record := fmt.Sprintf("%d%d%v%s%d", block.Index, block.Timestamp, block.Messages, block.PreviousHash, block.Size)
	h := sha3.New256()
	h.Write([]byte(record))
	hashed := h.Sum(nil)
	return hex.EncodeToString(hashed)
}

// getLatestBlock returns the latest block in the blockchain
func (bc *Blockchain) getLatestBlock() Block {
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	if len(bc.chain) == 0 {
		return Block{}
	}
	return bc.chain[len(bc.chain)-1]
}

// processMessages handles incoming messages
func (bc *Blockchain) processMessages() {
	for msg := range bc.messageChan {
		bc.mu.Lock()
		bc.pendingMessages = append(bc.pendingMessages, msg)
		bc.mu.Unlock()
	}
}

// encryptMessages handles message encryption asynchronously
func (bc *Blockchain) encryptMessages() {
	for msg := range bc.encryptionQueue {
		msg.Content = bc.encryptMessage(msg.Content)
		bc.messageChan <- msg
	}
}

// Helper function to encrypt a message
func (bc *Blockchain) encryptMessage(message []byte) []byte {
	key := []byte(bc.encryptionKey)

	block, err := aes.NewCipher(key)
	if err != nil {
		fmt.Println("Error creating cipher:", err)
		return nil
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		fmt.Println("Error creating GCM:", err)
		return nil
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		fmt.Println("Error creating nonce:", err)
		return nil
	}

	return gcm.Seal(nonce, nonce, message, nil)
}

func (bc *Blockchain) submitMessages(messages []Message) {
	currentSize := 0
	var blockMessages []Message

	for _, msg := range messages {
		encryptedContent := bc.encryptMessage(msg.Content)
		encryptedMsg := Message{
			Sender:      msg.Sender,
			Receiver:    msg.Receiver,
			Content:     encryptedContent,
			RequestTime: msg.RequestTime,
		}
		messageSize := estimateMessageSize(encryptedMsg)
		if currentSize+messageSize > MaxBlockSize {
			bc.mineBlock(blockMessages)
			blockMessages = []Message{}
			currentSize = 0
		}
		blockMessages = append(blockMessages, encryptedMsg)
		currentSize += messageSize
	}

	if len(blockMessages) > 0 {
		bc.mineBlock(blockMessages)
	}
}

func estimateMessageSize(msg Message) int {
	return len(msg.Sender) + len(msg.Receiver) + len(msg.Content) + 8 // 8 bytes for timestamp
}

// Handler function to handle message submission via JSON
func handleMessageSubmission(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Received message submission request")
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	var messages []Message
	err = json.Unmarshal(body, &messages)
	if err != nil {
		http.Error(w, "Invalid JSON format", http.StatusBadRequest)
		return
	}

	currentTime := time.Now().Unix()
	for i := range messages {
		messages[i].RequestTime = currentTime
	}

	fmt.Printf("Submitting %d messages\n", len(messages))

	done := make(chan bool)
	go func() {
		blockchain.submitMessages(messages)
		done <- true
	}()

	select {
	case <-done:
		fmt.Println("Messages processed successfully")
	case <-time.After(10 * time.Second):
		fmt.Println("Message submission timed out")
		http.Error(w, "Message submission timed out", http.StatusRequestTimeout)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Messages submitted for processing"})
}

// handleGetBlockchainInfo returns general information about the blockchain
func handleGetBlockchainInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	blockchain.mu.RLock()
	defer blockchain.mu.RUnlock()

	type SafeMessage struct {
		Sender      string `json:"sender"`
		Receiver    string `json:"receiver"`
		RequestTime int64  `json:"request_time"`
	}

	type SafeBlock struct {
		Index     int           `json:"index"`
		Timestamp int64         `json:"timestamp"`
		Messages  []SafeMessage `json:"messages"`
		Hash      string        `json:"hash"`
	}

	var safeChain []SafeBlock
	for _, block := range blockchain.chain {
		safeMessages := make([]SafeMessage, len(block.Messages))
		for i, msg := range block.Messages {
			safeMessages[i] = SafeMessage{
				Sender:      msg.Sender,
				Receiver:    msg.Receiver,
				RequestTime: msg.RequestTime,
			}
		}
		safeBlock := SafeBlock{
			Index:     block.Index,
			Timestamp: block.Timestamp,
			Messages:  safeMessages,
			Hash:      block.Hash,
		}
		safeChain = append(safeChain, safeBlock)
	}

	info := struct {
		Length          int         `json:"length"`
		Blocks          []SafeBlock `json:"blocks"`
		PendingMessages int         `json:"pending_messages"`
	}{
		Length:          len(blockchain.chain),
		Blocks:          safeChain,
		PendingMessages: len(blockchain.pendingMessages),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// handleGetBlockchainLength returns the length of the blockchain
func handleGetBlockchainLength(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	blockchain.mu.RLock()
	defer blockchain.mu.RUnlock()

	length := len(blockchain.chain)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]int{"length": length}); err != nil {
		http.Error(w, "Error encoding response", http.StatusInternalServerError)
		return
	}
}

// handleGetBlockByIndex returns the block with the given index
func handleGetBlockByIndex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	indexStr := r.URL.Query().Get("index")
	if indexStr == "" {
		http.Error(w, "Index not specified", http.StatusBadRequest)
		return
	}

	index, err := strconv.Atoi(indexStr)
	if err != nil || index < 0 {
		http.Error(w, "Invalid index", http.StatusBadRequest)
		return
	}

	blockchain.mu.RLock()
	defer blockchain.mu.RUnlock()

	if index >= len(blockchain.chain) {
		http.Error(w, "Index out of range", http.StatusBadRequest)
		return
	}

	block := blockchain.chain[index]
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(block); err != nil {
		http.Error(w, "Error encoding response", http.StatusInternalServerError)
		return
	}
}
