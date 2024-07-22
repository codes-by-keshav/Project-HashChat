// main.go

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

var blockchain *Blockchain
var distributedStorage *DistributedStorage

func main() {
	config, err := loadConfig()
	if err != nil {
		fmt.Println("Error loading configuration:", err)
		return
	}
	port := flag.String("port", "8080", "server port")

	flag.Parse()

	blockchain = NewBlockchain(config.EncryptionKey)
	distributedStorage = NewDistributedStorage(3) // Replication factor of 3

	// Start a goroutine to check for offline nodes periodically
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			distributedStorage.CheckOfflineNodes(15 * time.Minute)
		}
	}()

	http.HandleFunc("/submit", handleMessageSubmission)
	http.HandleFunc("/blockchain_info", handleGetBlockchainInfo)
	http.HandleFunc("/blockchain_length", handleGetBlockchainLength)
	http.HandleFunc("/block_by_index", handleGetBlockByIndex)
	http.HandleFunc("/verify_storage", handleVerifyStorage)
	http.HandleFunc("/heartbeat", handleHeartbeat)
	http.HandleFunc("/remove_storage", handleRemoveStorage)
	http.HandleFunc("/update_storage", handleUpdateStorage)

	fmt.Printf("Starting server on port %s\n", *port)
	if err := http.ListenAndServe(":"+*port, nil); err != nil {
		fmt.Printf("Failed to start server: %v\n", err)
	}
}
func handleVerifyStorage(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Received a storage verification request")

	if r.Method != http.MethodPost {
		fmt.Println("Method not allowed:", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var verification struct {
		UserID   string `json:"user_id"`
		Capacity string `json:"capacity"`
	}

	if err := json.NewDecoder(r.Body).Decode(&verification); err != nil {
		fmt.Println("Error decoding request body:", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if verification.Capacity == "" {
		fmt.Println("Capacity is empty")
		http.Error(w, "Capacity cannot be empty", http.StatusBadRequest)
		return
	}

	capacityBytes, err := strconv.ParseInt(verification.Capacity, 10, 64)
	if err != nil {
		fmt.Println("Error parsing capacity:", err)
		http.Error(w, "Invalid capacity value", http.StatusBadRequest)
		return
	}

	fmt.Printf("Verifying storage for user %s with capacity %d bytes\n", verification.UserID, capacityBytes)
	fmt.Printf("Total nodes before adding: %d\n", len(distributedStorage.Nodes))
	// Add or update the node in the distributed storage
	distributedStorage.AddNode(verification.UserID, capacityBytes)
	fmt.Printf("Total nodes after adding: %d\n", len(distributedStorage.Nodes))

	totalStorage := calculateTotalStorage()
	fmt.Printf("** Storage verification successful. Total storage for blockchain = %.2f GB **\n", totalStorage)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// Helper function to calculate total storage
func calculateTotalStorage() float64 {
	distributedStorage.mu.RLock()
	defer distributedStorage.mu.RUnlock()
	return float64(distributedStorage.TotalStorage) / (1024 * 1024 * 1024) // Convert to GB
}

func handleRemoveStorage(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Received a request to remove storage")

	if r.Method != http.MethodPost {
		fmt.Println("Method not allowed:", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var removal struct {
		UserID string `json:"user_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&removal); err != nil {
		fmt.Println("Error decoding request body:", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	fmt.Printf("Attempting to remove storage for user ID: %s\n", removal.UserID)

	removed := distributedStorage.RemoveNode(removal.UserID)

	if removed {
		fmt.Printf("Storage removed for user %s\n", removal.UserID)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	} else {
		fmt.Printf("Failed to remove storage for user %s (node not found)\n", removal.UserID)
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"status": "failure", "message": "Node not found"})
	}
}

func handleUpdateStorage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var update struct {
		UserID       string `json:"user_id"`
		PrevCapacity int64  `json:"prev_capacity"`
		NewCapacity  int64  `json:"new_capacity"`
	}

	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	distributedStorage.UpdateNodeCapacity(update.UserID, update.PrevCapacity, update.NewCapacity)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var heartbeat struct {
		UserID string `json:"user_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&heartbeat); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	distributedStorage.UpdateNodeLastSeen(heartbeat.UserID)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}
