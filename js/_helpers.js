const modulePrefix = 'pb'

export function getPrefix(name) {
  return [modulePrefix, name].join('-')
}