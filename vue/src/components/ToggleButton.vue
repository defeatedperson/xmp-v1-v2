<template>
  <div class="toggle-container" @click="toggle" :class="{ disabled: disabled }">
    <div class="toggle-button" :class="{ active: modelValue }">
      <div class="toggle-circle"></div>
    </div>
    <span v-if="label" class="toggle-label">{{ label }}</span>
  </div>
</template>

<script>
export default {
  name: 'ToggleButton',
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    label: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue'],
  methods: {
    toggle() {
      if (!this.disabled) {
        this.$emit('update:modelValue', !this.modelValue)
      }
    },
  },
}
</script>

<style scoped>
.toggle-container {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.toggle-container.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-button {
  position: relative;
  width: 50px;
  height: 26px;
  background-color: #ccc;
  border-radius: 13px;
  transition: background-color 0.3s ease;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.toggle-button.active {
  background-color: #42b983;
}

.toggle-circle {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-button.active .toggle-circle {
  transform: translateX(24px);
}

.toggle-label {
  margin-left: 10px;
  font-size: 14px;
  color: #c5c1c1;
}
</style>
