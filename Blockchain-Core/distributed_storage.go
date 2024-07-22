// distributed_storage.go

package main

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// StorageNode represents a user's storage contribution
type StorageNode struct {
	ID       string
	Capacity int64           // in bytes
	Blocks   map[string]bool // map of block hashes stored on this node
	LastSeen time.Time
	mu       sync.RWMutex
}

// DistributedStorage manages the distribution of blocks across nodes
type DistributedStorage struct {
	Nodes             map[string]*StorageNode
	BlockLocations    map[string][]string // map of block hash to node IDs
	ReplicationFactor int
	TotalStorage      int64
	mu                sync.RWMutex
}

// NewDistributedStorage creates a new DistributedStorage instance
func NewDistributedStorage(replicationFactor int) *DistributedStorage {
	return &DistributedStorage{
		Nodes:             make(map[string]*StorageNode),
		BlockLocations:    make(map[string][]string),
		ReplicationFactor: replicationFactor,
	}
}

// AddNode adds a new storage node to the system
func (ds *DistributedStorage) AddNode(id string, capacity int64) {
	ds.mu.Lock()
	defer ds.mu.Unlock()

	if capacity < 0 {
		fmt.Printf("Warning: Received negative capacity for node %s. Setting to 0.\n", id)
		capacity = 0
	}

	fmt.Printf("Adding/Updating node with ID: %s\n", id)
	if node, exists := ds.Nodes[id]; exists {
		// Update existing node's capacity
		ds.TotalStorage -= node.Capacity // Subtract old capacity
		node.Capacity = capacity
		ds.TotalStorage += capacity // Add new capacity
	} else {
		fmt.Printf("Adding new node %s\n", id)
		// Add new node
		ds.Nodes[id] = &StorageNode{
			ID:       id,
			Capacity: capacity,
			Blocks:   make(map[string]bool),
			LastSeen: time.Now(),
		}
		ds.TotalStorage += capacity // Add new capacity
	}
	fmt.Printf("Total nodes after add/update: %d\n", len(ds.Nodes))
	fmt.Printf("Added/Updated node %s with capacity %d bytes\n", id, capacity)
	fmt.Printf("Total storage: %.2f GB\n", float64(ds.TotalStorage)/(1024*1024*1024))
}

// RemoveNode removes a storage node from the system and redistributes its blocks
func (ds *DistributedStorage) RemoveNode(id string) bool {
	ds.mu.Lock()
	defer ds.mu.Unlock()

	fmt.Printf("Attempting to remove node with ID: %s\n", id)
	fmt.Printf("Total nodes before removal attempt: %d\n", len(ds.Nodes))

	if node, exists := ds.Nodes[id]; exists {
		fmt.Printf("Node found. Removing node %s with capacity %d bytes\n", id, node.Capacity)
		// Redistribute blocks if necessary
		for blockHash := range node.Blocks {
			ds.redistributeBlock(blockHash, id)
		}
		delete(ds.Nodes, id)
		ds.TotalStorage -= node.Capacity
		fmt.Printf("Removed node %s. Total nodes after removal: %d\n", id, len(ds.Nodes))
		fmt.Printf("Total storage after removal: %.2f GB\n", float64(ds.TotalStorage)/(1024*1024*1024))
		return true
	} else {
		fmt.Printf("Node not found. Attempted to remove non-existent node %s\n", id)
		fmt.Printf("Current nodes in the system: %v\n", ds.Nodes)
		return false
	}
}

func (ds *DistributedStorage) UpdateNodeCapacity(id string, prevCapacity, newCapacity int64) {
	ds.mu.Lock()
	defer ds.mu.Unlock()

	if node, exists := ds.Nodes[id]; exists {
		node.Capacity = newCapacity
	} else {
		ds.Nodes[id] = &StorageNode{
			ID:       id,
			Capacity: newCapacity,
			Blocks:   make(map[string]bool),
			LastSeen: time.Now(),
		}
	}

	fmt.Printf("Updated node %s capacity from %d to %d bytes\n", id, prevCapacity, newCapacity)
}

// StoreBlock stores a block in the distributed storage system
func (ds *DistributedStorage) StoreBlock(blockHash string, block interface{}) error {
	fmt.Printf("Stored block %s\n", blockHash)
	return ds.distributeBlock(blockHash, block)
}

// distributeBlock handles the logic for distributing a block across nodes
func (ds *DistributedStorage) distributeBlock(blockHash string, block interface{}) error {
	ds.mu.Lock()
	defer ds.mu.Unlock()

	// Select random nodes to store the block
	selectedNodes := ds.selectRandomNodes(ds.ReplicationFactor)

	for _, nodeID := range selectedNodes {
		node := ds.Nodes[nodeID]
		node.mu.Lock()
		node.Blocks[blockHash] = true
		node.mu.Unlock()

		ds.BlockLocations[blockHash] = append(ds.BlockLocations[blockHash], nodeID)
	}
	fmt.Printf("Distributed block %s to nodes %v\n", blockHash, selectedNodes)

	// Here you would actually store the block data on the selected nodes
	// This would involve network communication in a real implementation

	return nil
}

// selectRandomNodes selects n random nodes from the available nodes
func (ds *DistributedStorage) selectRandomNodes(n int) []string {
	var availableNodes []string
	for id := range ds.Nodes {
		availableNodes = append(availableNodes, id)
	}

	if len(availableNodes) <= n {
		return availableNodes
	}

	rand.Shuffle(len(availableNodes), func(i, j int) {
		availableNodes[i], availableNodes[j] = availableNodes[j], availableNodes[i]
	})

	return availableNodes[:n]
}

// redistributeBlock moves a block from one node to others
func (ds *DistributedStorage) redistributeBlock(blockHash string, excludeNodeID string) {
	currentLocations := ds.BlockLocations[blockHash]
	newLocations := make([]string, 0)

	for _, nodeID := range currentLocations {
		if nodeID != excludeNodeID {
			newLocations = append(newLocations, nodeID)
		}
	}
	fmt.Printf("Redistributing block %s from node %s\n", blockHash, excludeNodeID)

	// Add new nodes if necessary
	for len(newLocations) < ds.ReplicationFactor {
		newNode := ds.selectRandomNodes(1)[0]
		if newNode != excludeNodeID && !contains(newLocations, newNode) {
			newLocations = append(newLocations, newNode)
			ds.Nodes[newNode].Blocks[blockHash] = true
		}
	}

	ds.BlockLocations[blockHash] = newLocations
}

// Helper function to check if a slice contains a string
func contains(slice []string, item string) bool {
	for _, a := range slice {
		if a == item {
			return true
		}
	}
	return false
}

// UpdateNodeLastSeen updates the last seen time for a node
func (ds *DistributedStorage) UpdateNodeLastSeen(id string) {
	ds.mu.Lock()
	defer ds.mu.Unlock()

	if node, exists := ds.Nodes[id]; exists {
		node.LastSeen = time.Now()
	}
}

// CheckOfflineNodes checks for nodes that haven't been seen recently and removes them
func (ds *DistributedStorage) CheckOfflineNodes(timeout time.Duration) {
	ds.mu.Lock()
	defer ds.mu.Unlock()

	now := time.Now()
	for id, node := range ds.Nodes {
		if now.Sub(node.LastSeen) > timeout {
			fmt.Printf("Node %s has been offline for too long\n", id)
			ds.RemoveNode(id)
		}
	}
}
